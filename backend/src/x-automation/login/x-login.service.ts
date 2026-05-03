import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { chromium, type BrowserContext, type Page } from 'patchright';
import { LoginFlowError } from './login-error';
import { redactLoginDebugText, writeLoginDebugArtifact } from './login-debug-artifact';
import { ERROR_TEXT, HOME_URL_PREFIX, LOGIN_URL, SEL } from './login-selectors';
import type { XLoginCookies, XLoginInput, XLoginResult } from './login.types';
import { optionalBrowserChannel } from '@/x-automation/browser/browser-channel';
import { LOGIN_INIT_SCRIPT } from './login-stealth';
import { resolveProxy } from './proxy-resolver';
import { generateTotp } from './totp';
import {
  captureDebug,
  checkForCaptcha,
  classifyVisibleFailure,
  clickNamedButtonOrPressEnter,
  didLeaveUsernameStep,
  extractCookies,
  isLoggedInAs,
  isVisibleSoon,
  matchesErrorText,
  waitForAdvance,
} from './login-page.utils';

const USER_AGENT = process.env.LOGIN_USER_AGENT?.trim() || null;
const STEP_TIMEOUT_MS = parseInt(process.env.LOGIN_STEP_TIMEOUT_MS ?? '20000', 10);
const NAV_TIMEOUT_MS = parseInt(process.env.LOGIN_NAV_TIMEOUT_MS ?? '45000', 10);
const HEADFUL = (process.env.LOGIN_DEBUG_HEADFUL ?? 'false').toLowerCase() === 'true';
const SLOWMO_MS = parseInt(process.env.LOGIN_DEBUG_SLOWMO_MS ?? '0', 10);
const DATA_ROOT = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');

@Injectable()
export class XLoginService {
  private readonly log = new Logger(XLoginService.name);

  /**
   * Perform an end-to-end X login in a per-account persistent context.
   *
   * Reauth jobs reuse the existing account's user-data-dir so the login
   * session shares fingerprint, storage and IndexedDB with later tool calls
   * driven by XBrowserService — X otherwise sees two different "browsers"
   * for one account and is more likely to flag the session.
   *
   * Connect jobs (no targetAccountId yet) get a username-keyed staging dir
   * so consecutive retries for the same handle keep their warm-up state.
   *
   * Returns a discriminated-union result; never throws on user-input errors
   * (wrong password, captcha, …) — those are mapped to `XLoginFailure`. Only
   * unexpected infrastructure errors propagate.
   */
  async run(input: XLoginInput): Promise<XLoginResult> {
    const t0 = Date.now();
    const username = stripAt(input.username);
    const profileDir = resolveLoginProfileDir(input.targetAccountId, username);
    clearStaleLocks(profileDir);
    this.log.log(
      `login start username=${username} profile=${path.basename(profileDir)} ` +
        `headful=${HEADFUL} proxy=${input.proxyCountry ?? 'none'}`,
    );

    const proxy = resolveProxy(input.proxyCountry);
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    try {
      context = await chromium.launchPersistentContext(profileDir, {
        headless: !HEADFUL,
        ...optionalBrowserChannel(),
        slowMo: SLOWMO_MS || undefined,
        proxy: proxy ?? undefined,
        ...(USER_AGENT ? { userAgent: USER_AGENT } : {}),
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
        viewport: { width: 1280, height: 800 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
      context.setDefaultTimeout(STEP_TIMEOUT_MS);
      context.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
      await context.addInitScript(LOGIN_INIT_SCRIPT);

      page = context.pages()[0] ?? (await context.newPage());
      await this.runFlow(page, { ...input, username });
      const cookies = await extractCookies(context);
      const screenName = await this.verifyAuthenticatedSession(context, page, username, cookies);
      const userId = parseUserIdFromTwid(cookies.twid) ?? null;

      const durationMs = Date.now() - t0;
      this.log.log(`login success username=${username} screenName=${screenName} userId=${userId ?? '?'} duration=${durationMs}ms`);
      return { ok: true, screenName, userId, cookies, durationMs };
    } catch (err) {
      const durationMs = Date.now() - t0;
      if (err instanceof LoginFlowError) {
        const detail = await this.decorateFailureDetail(page, input, username, err, durationMs);
        this.log.warn(`login failed username=${username} reason=${err.reason} detail=${detail} duration=${durationMs}ms`);
        return { ok: false, reason: err.reason, detail, durationMs };
      }
      const detail = err instanceof Error ? err.message : String(err);
      this.log.error(`login error username=${username} detail=${detail} duration=${durationMs}ms`);
      return { ok: false, reason: 'unknown', detail: truncate(detail, 300), durationMs };
    } finally {
      try {
        if (context) await context.close();
      } catch {}
    }
  }

  private async runFlow(page: Page, input: XLoginInput & { username: string }): Promise<void> {
    // Warm-up: visit x.com root before the login flow so X sees the same
    // pattern a real user does (homepage → click "Sign in"). Skipped if the
    // persistent profile already has cookies for the target account
    // (reauth-on-warm-profile shouldn't double-fetch).
    await this.step('navigate', async () => {
      try {
        await page.goto('https://x.com/', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
        await page.waitForTimeout(1_500);
      } catch {
        // Best-effort warm-up; proceed to login URL even if root failed.
      }
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    }, page);

    await this.step('username', async () => {
      const field = page.locator(SEL.usernameInput).first();
      await field.waitFor({ state: 'visible' });
      // X's React form ignores DOM-set values (fill() bypass): we must dispatch
      // real keyboard events. Click for focus, type per-char, then submit.
      await field.click();
      await page.keyboard.type(input.username, { delay: 30 });
      await this.submitUsernameStep(page, field);
    }, page);

    // X may now show:
    //  (a) password screen directly, or
    //  (b) "unusual login" challenge asking for email/handle, or
    //  (c) Arkose captcha iframe
    await checkForCaptcha(page);

    if (await isVisibleSoon(page, SEL.challengeInput, 4000)) {
      await this.step('challenge', async () => {
        const challengeValue = (input.email ?? input.username).trim();
        const field = page.locator(SEL.challengeInput).first();
        await field.click();
        await page.keyboard.type(challengeValue, { delay: 30 });
        await clickNamedButtonOrPressEnter(page, SEL.nextButtonTexts);
        await waitForAdvance(page, SEL.challengeInput, 6000);
      });
    }

    await checkForCaptcha(page);

    await this.step('password', async () => {
      const field = page.locator(SEL.passwordInput).first();
      try {
        await field.waitFor({ state: 'visible' });
      } catch {
        if (await matchesErrorText(page, ERROR_TEXT.invalidCredentials)) {
          throw new LoginFlowError('invalid_credentials', 'username rejected (account flagged or unknown)');
        }
        const visibleFailure = await classifyVisibleFailure(page);
        if (visibleFailure) throw visibleFailure;
        const ctx = await captureDebug(page);
        throw new LoginFlowError('home_not_reached', `password field never appeared. ${ctx}`);
      }
      await field.click();
      await page.keyboard.type(input.password, { delay: 30 });
      const submitBtn = page.locator(SEL.loginSubmit).first();
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click();
      } else {
        await clickNamedButtonOrPressEnter(page, SEL.loginButtonTexts);
      }
    });

    if (await isVisibleSoon(page, SEL.totpInput, 5000)) {
      if (!input.totpSecret) {
        throw new LoginFlowError('email_verification_required', 'X prompted for a verification code');
      }
      await this.step('2fa', async () => {
        const code = generateTotp(input.totpSecret!);
        const field = page.locator(SEL.totpInput).first();
        await field.click();
        await page.keyboard.type(code, { delay: 30 });
        await clickNamedButtonOrPressEnter(page, SEL.nextButtonTexts);
      });
    }

    await this.step('verify-home', async () => {
      try {
        await page.waitForURL((url) => url.toString().startsWith(HOME_URL_PREFIX), {
          timeout: STEP_TIMEOUT_MS,
        });
      } catch {
        // Map to the most-likely cause based on what's on screen.
        if (await matchesErrorText(page, ERROR_TEXT.invalidCredentials)) {
          throw new LoginFlowError('invalid_credentials', 'password rejected');
        }
        if (await matchesErrorText(page, ERROR_TEXT.cooldown)) {
          throw new LoginFlowError('login_cooldown', 'X reports too many attempts');
        }
        if (await matchesErrorText(page, ERROR_TEXT.emailChallenge)) {
          throw new LoginFlowError('email_verification_required', 'X requires email verification');
        }
        if (await matchesErrorText(page, ERROR_TEXT.suspiciousLogin)) {
          throw new LoginFlowError('suspicious_login_blocked', 'X blocked this login as suspicious');
        }
        await checkForCaptcha(page);
        // URL-based classification — X parks blocked sessions at distinctive
        // paths well before the on-page text loads. Catches cases where the
        // page is visually empty but the URL alone tells the story.
        const urlReason = classifyByUrl(page.url());
        if (urlReason) throw new LoginFlowError(urlReason.reason, urlReason.detail);
        throw new LoginFlowError('home_not_reached', `did not reach /home (current=${page.url()})`);
      }
    });
  }

  private async submitUsernameStep(page: Page, field: import('patchright').Locator): Promise<void> {
    await clickNamedButtonOrPressEnter(page, SEL.nextButtonTexts);
    if (await didLeaveUsernameStep(page, 4000)) return;

    await field.press('Enter');
    if (await didLeaveUsernameStep(page, 4000)) return;

    await clickNamedButtonOrPressEnter(page, SEL.nextButtonTexts);
  }

  private async step<T>(name: string, fn: () => Promise<T>, page?: Page): Promise<T> {
    const t = Date.now();
    try {
      const out = await fn();
      this.log.debug(`step=${name} ok duration=${Date.now() - t}ms`);
      return out;
    } catch (err) {
      if (err instanceof LoginFlowError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      // Best-effort page-state snapshot so the failure detail surfaces a
      // *reason* (e.g. "url=…/login/error", "captcha=arkose", visible alert
      // text) instead of a bare 'Timeout exceeded'. Helpful when X drifts the
      // login DOM and selectors need tuning. Only inspected if `page` was
      // passed — keeps non-page steps lean.
      let extra = '';
      if (page) {
        try {
          const ctx = await captureDebug(page);
          if (ctx) extra = ` ${ctx}`;
        } catch {}
      }
      throw new LoginFlowError(
        'unknown',
        `step ${name}: ${truncate(msg, 160)}${extra}`,
      );
    }
  }

  private async decorateFailureDetail(
    page: Page | null,
    input: XLoginInput,
    username: string,
    err: LoginFlowError,
    durationMs: number,
  ): Promise<string> {
    const safeDetail = redactLoginDebugText(err.detail, [username, input.email, input.password, input.totpSecret]);
    if (!page) return safeDetail;

    try {
      const artifact = await writeLoginDebugArtifact({
        page,
        username,
        email: input.email,
        password: input.password,
        totpSecret: input.totpSecret,
        reason: err.reason,
        detail: safeDetail,
        durationMs,
      });
      return artifact ? `${safeDetail} debug_artifact=${artifact.path}` : safeDetail;
    } catch (artifactErr) {
      const artifactDetail = artifactErr instanceof Error ? artifactErr.message : String(artifactErr);
      this.log.warn(`login debug artifact failed username=${username} detail=${truncate(artifactDetail, 160)}`);
      return safeDetail;
    }
  }

  private async verifyAuthenticatedSession(
    context: BrowserContext,
    page: Page,
    typedUsername: string,
    cookies: XLoginCookies,
  ): Promise<string> {
    if (await isLoggedInAs(page, typedUsername)) return typedUsername;

    // Fetch from inside the browser context so cookies + UA match the session.
    const urls = [
      'https://api.x.com/1.1/account/settings.json',
      'https://x.com/i/api/1.1/account/settings.json',
    ];
    let lastStatus: number | null = null;

    for (const url of urls) {
      try {
        const res = await context.request.get(url, {
          headers: {
            'x-csrf-token': cookies.ct0,
            'authorization':
              'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
          },
          timeout: 10_000,
        });
        lastStatus = res.status();
        if (res.ok()) {
          const body = (await res.json()) as { screen_name?: string };
          if (body.screen_name) return body.screen_name;
          throw new LoginFlowError('cookies_missing', 'authenticated settings response missing screen_name');
        }

        if (res.status() === 401 || res.status() === 403) {
          throw new LoginFlowError('cookies_missing', `authenticated settings rejected session (status=${res.status()})`);
        }
      } catch (err) {
        if (err instanceof LoginFlowError) throw err;
        const detail = err instanceof Error ? err.message : String(err);
        throw new LoginFlowError('home_not_reached', `authenticated settings check errored: ${truncate(detail, 160)}`);
      }
    }

    throw new LoginFlowError('home_not_reached', `authenticated settings check failed (last_status=${lastStatus ?? '?'})`);
  }
}

function stripAt(s: string): string {
  return s.trim().replace(/^@+/, '');
}

function parseUserIdFromTwid(twid: string | null): string | null {
  if (!twid) return null;
  // twid cookie format: u%3D<userId>  (URL-encoded "u=<userId>")
  const decoded = decodeURIComponent(twid);
  const m = decoded.match(/^u=(\d+)/);
  return m ? m[1] : null;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/**
 * Classify a stuck-not-on-home URL into a specific failure_reason.
 * X parks blocked sessions at /account/access (locked), /account/access/
 * identity (phone challenge), and /login/error (bad creds) — all detectable
 * before any on-page text loads, which is faster + more reliable than
 * scraping the body.
 */
function classifyByUrl(rawUrl: string): { reason: import('./login.types').LoginJobFailureReason; detail: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const p = parsed.pathname.toLowerCase();
  if (p.startsWith('/account/access/identity') || p.startsWith('/i/flow/login/identity')) {
    return { reason: 'phone_verification_required', detail: `X requires phone verification (url=${p})` };
  }
  if (p.startsWith('/account/access')) {
    return { reason: 'account_locked', detail: `X locked the account (url=${p})` };
  }
  if (p.startsWith('/login/error') || parsed.searchParams.has('error')) {
    return { reason: 'invalid_credentials', detail: `X redirected to login error (url=${p})` };
  }
  if (p.startsWith('/i/flow/login') && parsed.searchParams.get('redirect_after_login_url')) {
    return { reason: 'login_cooldown', detail: 'X bounced back to login URL with redirect_after_login_url' };
  }
  return null;
}

/**
 * Pick the user-data-dir for a login session. Reauth uses the existing
 * account's dir (same path XBrowserService.resolveProfileDir uses) so the
 * fingerprint stays consistent. Connect uses a username-keyed staging dir.
 */
function resolveLoginProfileDir(targetAccountId: string | null | undefined, username: string): string {
  const safe = (targetAccountId ?? `login-${username.toLowerCase()}`).replace(
    /[^A-Za-z0-9._-]/g,
    '_',
  );
  return path.join(DATA_ROOT, 'user-data', safe);
}

/**
 * Persistent contexts leave SingletonLock files behind when crashed; clear
 * them before the next launch or chromium will refuse to bind.
 */
function clearStaleLocks(profileDir: string): void {
  fs.mkdirSync(profileDir, { recursive: true });
  for (const name of ['SingletonCookie', 'SingletonLock', 'SingletonSocket']) {
    try {
      fs.rmSync(path.join(profileDir, name), { force: true, recursive: true });
    } catch {}
  }
}
