import { Injectable, Logger } from '@nestjs/common';
import { chromium, type BrowserContext, type Locator, type Page } from 'patchright';
import { LoginFlowError } from './login-error';
import { redactLoginDebugText, writeLoginDebugArtifact } from './login-debug-artifact';
import { ERROR_TEXT, HOME_URL_PREFIX, LOGIN_URL, SEL } from './login-selectors';
import type { LoginJobFailureReason, XLoginCookies, XLoginInput, XLoginResult } from './login.types';
import { optionalBrowserChannel } from '@/x-automation/browser/browser-channel';
import { resolveProxy } from './proxy-resolver';
import { generateTotp } from './totp';

const USER_AGENT = process.env.LOGIN_USER_AGENT?.trim() || null;
const STEP_TIMEOUT_MS = parseInt(process.env.LOGIN_STEP_TIMEOUT_MS ?? '20000', 10);
const NAV_TIMEOUT_MS = parseInt(process.env.LOGIN_NAV_TIMEOUT_MS ?? '45000', 10);
const HEADFUL = (process.env.LOGIN_DEBUG_HEADFUL ?? 'false').toLowerCase() === 'true';
const SLOWMO_MS = parseInt(process.env.LOGIN_DEBUG_SLOWMO_MS ?? '0', 10);

@Injectable()
export class XLoginService {
  private readonly log = new Logger(XLoginService.name);

  /**
   * Perform an end-to-end X login in a fresh ephemeral browser context.
   * Returns a discriminated-union result; never throws on user-input errors
   * (wrong password, captcha, …) — those are mapped to `XLoginFailure`. Only
   * unexpected infrastructure errors propagate.
   */
  async run(input: XLoginInput): Promise<XLoginResult> {
    const t0 = Date.now();
    const username = stripAt(input.username);
    this.log.log(`login start username=${username} headful=${HEADFUL} proxy=${input.proxyCountry ?? 'none'}`);

    const proxy = resolveProxy(input.proxyCountry);
    const browser = await chromium.launch({
      headless: !HEADFUL,
      ...optionalBrowserChannel(),
      slowMo: SLOWMO_MS || undefined,
      proxy: proxy ?? undefined,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    let context: BrowserContext | null = null;
    let page: Page | null = null;
    try {
      context = await browser.newContext({
        ...(USER_AGENT ? { userAgent: USER_AGENT } : {}),
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
        viewport: { width: 1280, height: 800 },
      });
      context.setDefaultTimeout(STEP_TIMEOUT_MS);
      context.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

      page = await context.newPage();
      await this.runFlow(page, { ...input, username });
      const cookies = await this.extractCookies(context);
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
      try {
        await browser.close();
      } catch {}
    }
  }

  private async runFlow(page: Page, input: XLoginInput & { username: string }): Promise<void> {
    await this.step('navigate', async () => {
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    });

    await this.step('username', async () => {
      const field = page.locator(SEL.usernameInput).first();
      await field.waitFor({ state: 'visible' });
      // X's React form ignores DOM-set values (fill() bypass): we must dispatch
      // real keyboard events. Click for focus, type per-char, then submit.
      await field.click();
      await page.keyboard.type(input.username, { delay: 30 });
      await this.submitUsernameStep(page, field);
    });

    // X may now show:
    //  (a) password screen directly, or
    //  (b) "unusual login" challenge asking for email/handle, or
    //  (c) Arkose captcha iframe
    await this.checkForCaptcha(page);

    if (await this.isVisibleSoon(page, SEL.challengeInput, 4000)) {
      await this.step('challenge', async () => {
        const challengeValue = (input.email ?? input.username).trim();
        const field = page.locator(SEL.challengeInput).first();
        await field.click();
        await page.keyboard.type(challengeValue, { delay: 30 });
        await this.clickNamedButtonOrPressEnter(page, SEL.nextButtonTexts);
        await this.waitForAdvance(page, SEL.challengeInput, 6000);
      });
    }

    await this.checkForCaptcha(page);

    await this.step('password', async () => {
      const field = page.locator(SEL.passwordInput).first();
      try {
        await field.waitFor({ state: 'visible' });
      } catch {
        if (await this.matchesErrorText(page, ERROR_TEXT.invalidCredentials)) {
          throw new LoginFlowError('invalid_credentials', 'username rejected (account flagged or unknown)');
        }
        const visibleFailure = await this.classifyVisibleFailure(page);
        if (visibleFailure) throw visibleFailure;
        const ctx = await this.captureDebug(page);
        throw new LoginFlowError('home_not_reached', `password field never appeared. ${ctx}`);
      }
      await field.click();
      await page.keyboard.type(input.password, { delay: 30 });
      const submitBtn = page.locator(SEL.loginSubmit).first();
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click();
      } else {
        await this.clickNamedButtonOrPressEnter(page, SEL.loginButtonTexts);
      }
    });

    if (await this.isVisibleSoon(page, SEL.totpInput, 5000)) {
      if (!input.totpSecret) {
        throw new LoginFlowError('email_verification_required', 'X prompted for a verification code');
      }
      await this.step('2fa', async () => {
        const code = generateTotp(input.totpSecret!);
        const field = page.locator(SEL.totpInput).first();
        await field.click();
        await page.keyboard.type(code, { delay: 30 });
        await this.clickNamedButtonOrPressEnter(page, SEL.nextButtonTexts);
      });
    }

    await this.step('verify-home', async () => {
      try {
        await page.waitForURL((url) => url.toString().startsWith(HOME_URL_PREFIX), {
          timeout: STEP_TIMEOUT_MS,
        });
      } catch {
        // Map to the most-likely cause based on what's on screen.
        if (await this.matchesErrorText(page, ERROR_TEXT.invalidCredentials)) {
          throw new LoginFlowError('invalid_credentials', 'password rejected');
        }
        if (await this.matchesErrorText(page, ERROR_TEXT.cooldown)) {
          throw new LoginFlowError('login_cooldown', 'X reports too many attempts');
        }
        if (await this.matchesErrorText(page, ERROR_TEXT.emailChallenge)) {
          throw new LoginFlowError('email_verification_required', 'X requires email verification');
        }
        if (await this.matchesErrorText(page, ERROR_TEXT.suspiciousLogin)) {
          throw new LoginFlowError('suspicious_login_blocked', 'X blocked this login as suspicious');
        }
        await this.checkForCaptcha(page);
        throw new LoginFlowError('home_not_reached', `did not reach /home (current=${page.url()})`);
      }
    });
  }

  /**
   * Wait until the field that just submitted is no longer the visible primary
   * input — i.e. the form actually advanced. Without this, the next step's
   * waitFor() races against an unchanged DOM.
   */
  private async waitForAdvance(page: Page, currentSelector: string, timeoutMs: number): Promise<void> {
    try {
      await page.locator(currentSelector).first().waitFor({ state: 'detached', timeout: timeoutMs });
    } catch {
      // The same selector may persist across steps (e.g. challenge re-uses
      // the username input); not fatal — the next step's waitFor will catch
      // the real situation.
    }
  }

  private async step<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const t = Date.now();
    try {
      const out = await fn();
      this.log.debug(`step=${name} ok duration=${Date.now() - t}ms`);
      return out;
    } catch (err) {
      if (err instanceof LoginFlowError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      // TimeoutError is what Patchright throws on selector waits; map it
      // generically — concrete classification happens at higher layers (e.g.
      // verify-home checks the page text).
      throw new LoginFlowError('unknown', `step ${name}: ${truncate(msg, 200)}`);
    }
  }

  private async isVisibleSoon(page: Page, selector: string, timeoutMs: number): Promise<boolean> {
    try {
      await page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs });
      return true;
    } catch {
      return false;
    }
  }

  private async checkForCaptcha(page: Page): Promise<void> {
    const frame = page.locator(SEL.arkoseFrame).first();
    if (await frame.isVisible().catch(() => false)) {
      throw new LoginFlowError('captcha_required', 'arkose challenge presented');
    }
  }

  private async classifyVisibleFailure(page: Page): Promise<LoginFlowError | null> {
    const mappings: Array<{ reason: LoginJobFailureReason; needles: readonly string[]; detail: string }> = [
      { reason: 'invalid_credentials', needles: ERROR_TEXT.invalidCredentials, detail: 'credentials rejected' },
      { reason: 'login_cooldown', needles: ERROR_TEXT.cooldown, detail: 'X reports too many attempts' },
      { reason: 'email_verification_required', needles: ERROR_TEXT.emailChallenge, detail: 'X requires email verification' },
      { reason: 'suspicious_login_blocked', needles: ERROR_TEXT.suspiciousLogin, detail: 'X blocked this login as suspicious' },
    ];

    for (const mapping of mappings) {
      if (await this.matchesErrorText(page, mapping.needles)) {
        return new LoginFlowError(mapping.reason, mapping.detail);
      }
    }

    return null;
  }

  private async submitUsernameStep(page: Page, field: Locator): Promise<void> {
    await this.clickNamedButtonOrPressEnter(page, SEL.nextButtonTexts);
    if (await this.didLeaveUsernameStep(page, 4000)) return;

    await field.press('Enter');
    if (await this.didLeaveUsernameStep(page, 4000)) return;

    await this.clickNamedButtonOrPressEnter(page, SEL.nextButtonTexts);
  }

  private async didLeaveUsernameStep(page: Page, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await page.locator(SEL.passwordInput).first().isVisible().catch(() => false)) return true;
      if (await page.locator(SEL.challengeInput).first().isVisible().catch(() => false)) return true;
      if (await page.locator(SEL.arkoseFrame).first().isVisible().catch(() => false)) return true;
      await page.waitForTimeout(250);
    }
    return false;
  }

  private async clickNamedButtonOrPressEnter(page: Page, names: readonly string[]): Promise<void> {
    const pattern = new RegExp(`^(${names.map(escapeRegExp).join('|')})$`, 'i');
    const roleButton = page.getByRole('button', { name: pattern }).first();
    if (await roleButton.isVisible().catch(() => false)) {
      await roleButton.click();
      return;
    }

    const textButton = page.locator('button, [role="button"]').filter({ hasText: pattern }).first();
    if (await textButton.isVisible().catch(() => false)) {
      await textButton.click();
      return;
    }

    await page.keyboard.press('Enter');
  }

  private async captureDebug(page: Page): Promise<string> {
    try {
      const url = page.url();
      const title = await page.title().catch(() => '?');
      const inputCount = await page.locator('input').count().catch(() => -1);
      const inputs = await page
        .locator('input')
        .evaluateAll((els) =>
          els.slice(0, 10).map((e) => {
            const i = e as HTMLInputElement;
            return `${i.type || '?'}|name=${i.name || ''}|ac=${i.autocomplete || ''}|tid=${i.dataset.testid || ''}`;
          }),
        )
        .catch(() => ['(eval failed)']);
      const visibleText = redactLoginDebugText(
        (await page.locator('body').innerText().catch(() => '')).slice(0, 200).replace(/\s+/g, ' '),
        [],
      );
      return `url=${url} title=${title} inputs(${inputCount})=[${inputs.join(' ; ')}] body~${visibleText}`;
    } catch {
      return 'captureDebug failed';
    }
  }

  private async matchesErrorText(page: Page, needles: readonly string[]): Promise<boolean> {
    const haystack = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
    return needles.some((n) => haystack.includes(n.toLowerCase()));
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

  private async extractCookies(context: BrowserContext): Promise<XLoginCookies> {
    const all = await context.cookies(['https://x.com', 'https://twitter.com']);
    const byName = new Map(all.map((c) => [c.name, c.value]));
    const authToken = byName.get('auth_token');
    const ct0 = byName.get('ct0');
    const twid = byName.get('twid') ?? null;
    if (!authToken || !ct0) {
      throw new LoginFlowError(
        'cookies_missing',
        `login completed but cookies missing (auth_token=${!!authToken}, ct0=${!!ct0})`,
      );
    }
    return { authToken, ct0, twid };
  }

  private async verifyAuthenticatedSession(
    context: BrowserContext,
    page: Page,
    typedUsername: string,
    cookies: XLoginCookies,
  ): Promise<string> {
    if (await this.isLoggedInAs(page, typedUsername)) return typedUsername;

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

  private async isLoggedInAs(page: Page, username: string): Promise<boolean> {
    const bodyText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
    return bodyText.includes(`@${username.toLowerCase()}`);
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
