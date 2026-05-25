import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { chromium, type BrowserContext, type Page } from 'patchright';
import { LoginFlowError } from './login-error';
import { redactLoginDebugText, writeLoginDebugArtifact } from './login-debug-artifact';
import { ERROR_TEXT, HOME_URL_PREFIX, LOGIN_URL, SEL } from './login-selectors';
import type { XLoginInput, XLoginResult } from './login.types';
import { optionalBrowserChannel } from '@/x-automation/browser/browser-channel';
import { clearStaleLocks } from '@/x-automation/browser/clear-stale-locks';
import { LOGIN_INIT_SCRIPT } from './login-stealth';
import { humanDelay, humanWarmup, moveMouseRandomly, randomViewport } from './login-humanize';
import { resolveProxy } from './proxy-resolver';
import { generateTotp } from './totp';
import {
  captureDebug,
  checkForCaptcha,
  classifyVisibleFailure,
  clickNamedButtonOrPressEnter,
  didLeaveUsernameStep,
  enterTextLikeUser,
  extractCookies,
  hasRetryableLoginPageError,
  isVisibleSoon,
  clickVisibleNamedControl,
  matchesErrorText,
  waitForAdvance,
} from './login-page.utils';
import {
  classifyByUrl,
  classifyOnboardingError,
  collectOnboardingErrors,
  parseUserIdFromTwid,
  resolveLoginProfileDir,
  stripAt,
  truncate,
} from './login-classifiers';
import { tryPreLoginSession, verifyAuthenticatedSession } from './login-session-check';

// Re-exports preserved for backward compatibility with consumers (specs and
// scripts import these from x-login.service directly).
export { classifyOnboardingError, resolveLoginProfileDir };

const USER_AGENT = process.env.LOGIN_USER_AGENT?.trim() || null;
const STEP_TIMEOUT_MS = parseInt(process.env.LOGIN_STEP_TIMEOUT_MS ?? '20000', 10);
const NAV_TIMEOUT_MS = parseInt(process.env.LOGIN_NAV_TIMEOUT_MS ?? '45000', 10);
const HEADFUL = (process.env.LOGIN_DEBUG_HEADFUL ?? 'false').toLowerCase() === 'true';
const SLOWMO_MS = parseInt(process.env.LOGIN_DEBUG_SLOWMO_MS ?? '0', 10);

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
    const profileDir = resolveLoginProfileDir(input.targetAccountId, username, input.proxyCountry);
    clearStaleLocks(profileDir);
    this.log.log(
      `login start username=${username} profile=${path.basename(profileDir)} ` +
        `headful=${HEADFUL} proxy=${input.proxyCountry ?? 'none'}`,
    );

    const proxy = resolveProxy(input.proxyCountry);
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    try {
      const vp = randomViewport();
      context = await chromium.launchPersistentContext(profileDir, {
        headless: !HEADFUL,
        ...optionalBrowserChannel(),
        slowMo: SLOWMO_MS || undefined,
        proxy: proxy ?? undefined,
        ...(USER_AGENT ? { userAgent: USER_AGENT } : {}),
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
        viewport: vp,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-features=AutomationControlled',
          '--no-sandbox',
          '--disable-dev-shm-usage',
          `--window-size=${vp.width + 16},${vp.height + 88}`,
        ],
      });
      context.setDefaultTimeout(STEP_TIMEOUT_MS);
      context.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
      await context.addInitScript(LOGIN_INIT_SCRIPT);

      page = context.pages()[0] ?? (await context.newPage());
      const onboardingErrors = collectOnboardingErrors(page);

      const preLogin = await tryPreLoginSession(context, page, username);
      if (preLogin) {
        const durationMs = Date.now() - t0;
        this.log.log(`login skipped (session valid) username=${username} screenName=${preLogin.screenName} duration=${durationMs}ms`);
        return { ok: true, screenName: preLogin.screenName, userId: parseUserIdFromTwid(preLogin.cookies.twid) ?? null, cookies: preLogin.cookies, durationMs };
      }

      await this.runFlow(page, { ...input, username }, onboardingErrors);
      const cookies = await extractCookies(context);
      const screenName = await verifyAuthenticatedSession(context, page, username, cookies);
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

  private async runFlow(
    page: Page,
    input: XLoginInput & { username: string },
    onboardingErrors: string[],
  ): Promise<void> {
    // Warm-up: visit x.com root before the login flow so X sees the same
    // pattern a real user does (homepage → click "Sign in"). Skipped if the
    // persistent profile already has cookies for the target account
    // (reauth-on-warm-profile shouldn't double-fetch).
    await this.step('navigate', async () => {
      try {
        await page.goto('https://x.com/', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
        await humanWarmup(page);
      } catch {
        // Best-effort warm-up; proceed to login URL even if root failed.
      }
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
      await humanDelay(500, 1200);
      await moveMouseRandomly(page);
    }, page);

    await this.step('username', async () => {
      const field = await this.waitForUsernameInput(page);
      // X's React form ignores DOM-set values (fill() bypass): we must dispatch
      // real keyboard events. Click for focus, type per-char, then submit.
      await enterTextLikeUser(page, field, input.username);
      await this.submitUsernameStep(page, field, onboardingErrors);
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
        await enterTextLikeUser(page, field, challengeValue);
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
      await enterTextLikeUser(page, field, input.password);
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
        await enterTextLikeUser(page, field, code);
        await clickNamedButtonOrPressEnter(page, SEL.nextButtonTexts);
      });
    }

    await this.verifyHome(page);
  }

  private async verifyHome(page: Page): Promise<void> {
    await this.step('verify-home', async () => {
      try {
        await page.waitForURL((url) => url.toString().startsWith(HOME_URL_PREFIX), {
          timeout: STEP_TIMEOUT_MS,
        });
      } catch {
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
        const urlReason = classifyByUrl(page.url());
        if (urlReason) throw new LoginFlowError(urlReason.reason, urlReason.detail);
        throw new LoginFlowError('home_not_reached', `did not reach /home (current=${page.url()})`);
      }
    });
  }

  private async waitForUsernameInput(page: Page): Promise<import('patchright').Locator> {
    const field = page.locator(SEL.usernameInput).first();
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await field.waitFor({ state: 'visible' });
        return field;
      } catch (err) {
        const retryableLoginPage = await hasRetryableLoginPageError(page);
        if (!retryableLoginPage && await clickVisibleNamedControl(page, SEL.loginButtonTexts)) {
          this.log.warn(
            `X login rendered landing page before username input; clicking login entry point ` +
              `attempt=${attempt}/${maxAttempts}.`,
          );
          await page.waitForTimeout(2_000);
          continue;
        }
        if (!retryableLoginPage) throw err;
      }

      this.log.warn(
        `X login rendered retryable error page before username input; ` +
          `clicking retry button and reloading login flow attempt=${attempt}/${maxAttempts}.`,
      );
      await clickNamedButtonOrPressEnter(page, SEL.retryButtonTexts);
      await page.waitForTimeout(2_000);
      if (await field.isVisible().catch(() => false)) return field;
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      await page.waitForTimeout(1_000);
    }

    const ctx = await captureDebug(page);
    throw new LoginFlowError(
      'home_not_reached',
      `retryable login page before username input after ${maxAttempts} attempts. ${ctx}`,
    );
  }

  private async submitUsernameStep(
    page: Page,
    field: import('patchright').Locator,
    onboardingErrors: string[],
  ): Promise<void> {
    await clickNamedButtonOrPressEnter(page, SEL.nextButtonTexts);
    if (await didLeaveUsernameStep(page, 4000)) return;

    await field.press('Enter');
    if (await didLeaveUsernameStep(page, 4000)) return;

    await clickNamedButtonOrPressEnter(page, SEL.nextButtonTexts);
    if (await didLeaveUsernameStep(page, 4000)) return;

    await checkForCaptcha(page);
    const apiFailure = classifyOnboardingError(onboardingErrors[onboardingErrors.length - 1]);
    if (apiFailure) throw new LoginFlowError(apiFailure.reason, apiFailure.detail);
    const visibleFailure = await classifyVisibleFailure(page);
    if (visibleFailure) throw visibleFailure;
    const ctx = await captureDebug(page);
    throw new LoginFlowError('home_not_reached', `username step did not advance. ${ctx}`);
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
}
