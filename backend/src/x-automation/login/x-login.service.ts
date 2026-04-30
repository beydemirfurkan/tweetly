import { Injectable, Logger } from '@nestjs/common';
import { chromium, type BrowserContext, type Page } from 'patchright';
import { LoginFlowError } from './login-error';
import { ERROR_TEXT, HOME_URL_PREFIX, LOGIN_URL, SEL } from './login-selectors';
import type { XLoginCookies, XLoginInput, XLoginResult } from './login.types';
import { resolveProxy } from './proxy-resolver';
import { generateTotp } from './totp';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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
      channel: 'chrome',
      slowMo: SLOWMO_MS || undefined,
      proxy: proxy ?? undefined,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    let context: BrowserContext | null = null;
    try {
      context = await browser.newContext({
        userAgent: USER_AGENT,
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
        viewport: { width: 1280, height: 800 },
      });
      context.setDefaultTimeout(STEP_TIMEOUT_MS);
      context.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

      const page = await context.newPage();
      await this.runFlow(page, { ...input, username });
      const cookies = await this.extractCookies(context);
      const screenName = await this.verifyHandle(context, username, cookies);
      const userId = parseUserIdFromTwid(cookies.twid) ?? null;

      const durationMs = Date.now() - t0;
      this.log.log(`login success username=${username} screenName=${screenName} userId=${userId ?? '?'} duration=${durationMs}ms`);
      return { ok: true, screenName, userId, cookies, durationMs };
    } catch (err) {
      const durationMs = Date.now() - t0;
      if (err instanceof LoginFlowError) {
        this.log.warn(`login failed username=${username} reason=${err.reason} detail=${err.detail} duration=${durationMs}ms`);
        return { ok: false, reason: err.reason, detail: err.detail, durationMs };
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
      // real keyboard events. Click for focus, type per-char, then Enter.
      await field.click();
      await page.keyboard.type(input.username, { delay: 30 });
      await page.keyboard.press('Enter');
      await this.waitForAdvance(page, SEL.usernameInput, 6000);
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
        await page.keyboard.press('Enter');
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
        const ctx = await this.captureDebug(page);
        throw new LoginFlowError('unknown', `step password: password field never appeared. ${ctx}`);
      }
      await field.click();
      await page.keyboard.type(input.password, { delay: 30 });
      const submitBtn = page.locator(SEL.loginSubmit).first();
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
    });

    if (await this.isVisibleSoon(page, SEL.totpInput, 5000)) {
      if (!input.totpSecret) {
        throw new LoginFlowError('email_challenge', '2FA prompted but no totp_secret provided');
      }
      await this.step('2fa', async () => {
        const code = generateTotp(input.totpSecret!);
        const field = page.locator(SEL.totpInput).first();
        await field.click();
        await page.keyboard.type(code, { delay: 30 });
        await page.keyboard.press('Enter');
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
          throw new LoginFlowError('email_challenge', 'X requires email verification code');
        }
        await this.checkForCaptcha(page);
        throw new LoginFlowError('unknown', `did not reach /home (current=${page.url()})`);
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
      const visibleText = (await page.locator('body').innerText().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ');
      return `url=${url} title=${title} inputs(${inputCount})=[${inputs.join(' ; ')}] body~${visibleText}`;
    } catch {
      return 'captureDebug failed';
    }
  }

  private async matchesErrorText(page: Page, needles: readonly string[]): Promise<boolean> {
    const haystack = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
    return needles.some((n) => haystack.includes(n.toLowerCase()));
  }

  private async extractCookies(context: BrowserContext): Promise<XLoginCookies> {
    const all = await context.cookies(['https://x.com', 'https://twitter.com']);
    const byName = new Map(all.map((c) => [c.name, c.value]));
    const authToken = byName.get('auth_token');
    const ct0 = byName.get('ct0');
    const twid = byName.get('twid') ?? null;
    if (!authToken || !ct0) {
      throw new LoginFlowError(
        'unknown',
        `login completed but cookies missing (auth_token=${!!authToken}, ct0=${!!ct0})`,
      );
    }
    return { authToken, ct0, twid };
  }

  private async verifyHandle(
    context: BrowserContext,
    typedUsername: string,
    cookies: XLoginCookies,
  ): Promise<string> {
    // Fetch from inside the browser context so cookies + UA match the session.
    try {
      const res = await context.request.get('https://api.x.com/1.1/account/settings.json', {
        headers: {
          'x-csrf-token': cookies.ct0,
          'authorization':
            'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
        },
        timeout: 10_000,
      });
      if (res.ok()) {
        const body = (await res.json()) as { screen_name?: string };
        if (body.screen_name) return body.screen_name;
      }
    } catch {
      // fall through
    }
    return typedUsername;
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
