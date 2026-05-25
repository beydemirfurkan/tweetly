import type { BrowserContext, Locator, Page } from 'patchright';
import { LoginFlowError } from './login-error';
import { ERROR_TEXT, SEL } from './login-selectors';
import type { LoginJobFailureReason, XLoginCookies } from './login.types';
import { humanDelay, humanTypeDelay } from './login-humanize';

/**
 * Pure DOM-poking helpers carved out of x-login.service.ts. Side-effect-free
 * relative to service state — they only touch the page/context they receive.
 *
 * Lives next to x-login.service.ts so the service stays the orchestrator and
 * the file count for the login flow stays sane (3 .ts vs 1 god-file).
 */

export async function matchesErrorText(page: Page, needles: readonly string[]): Promise<boolean> {
  const haystack = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  return needles.some((n) => haystack.includes(n.toLowerCase()));
}

/**
 * Read the visible-alert / toast banner contents. Returns lowercased
 * concatenated text or null when no banner is rendered — callers should
 * fall back to a full-body scan in that case (the banner has historically
 * been gated by feature flags and isn't 100% reliable).
 */
async function readErrorBannerText(page: Page): Promise<string | null> {
  const locator = page.locator(SEL.errorBanner);
  if (!(await locator.first().isVisible().catch(() => false))) return null;
  const texts = await locator.allInnerTexts().catch(() => [] as string[]);
  if (texts.length === 0) return null;
  return texts.join('\n').toLowerCase();
}

export async function classifyVisibleFailure(page: Page): Promise<LoginFlowError | null> {
  const mappings: Array<{ reason: LoginJobFailureReason; needles: readonly string[]; detail: string }> = [
    { reason: 'invalid_credentials', needles: ERROR_TEXT.invalidCredentials, detail: 'credentials rejected' },
    { reason: 'login_cooldown', needles: ERROR_TEXT.cooldown, detail: 'X reports too many attempts' },
    { reason: 'email_verification_required', needles: ERROR_TEXT.emailChallenge, detail: 'X requires email verification' },
    { reason: 'suspicious_login_blocked', needles: ERROR_TEXT.suspiciousLogin, detail: 'X blocked this login as suspicious' },
  ];

  // Banner-first: the visible alert/toast is where X actually surfaces
  // login errors. Scoping the match here removes false positives from a
  // sidebar tweet that happens to contain "wrong password" or a
  // marketing banner with "too many attempts" copy.
  const bannerText = await readErrorBannerText(page);
  if (bannerText) {
    for (const m of mappings) {
      if (m.needles.some((n) => bannerText.includes(n.toLowerCase()))) {
        return new LoginFlowError(m.reason, `${m.detail} (banner)`);
      }
    }
  }

  // Banner absent (older UI variants, or X hid it under a flag) — fall
  // back to the historical full-body scan so we don't lose coverage.
  for (const m of mappings) {
    if (await matchesErrorText(page, m.needles)) {
      return new LoginFlowError(m.reason, m.detail);
    }
  }
  return null;
}

export function isRetryableLoginPageText(text: string): boolean {
  const normalized = text.toLowerCase();
  return [
    'bir sorun oluştu',
    'yeniden yüklemeyi dene',
    'yeniden dene',
    'something went wrong',
    'try reloading',
    'try again',
  ].some((needle) => normalized.includes(needle));
}

export async function hasRetryableLoginPageError(page: Page): Promise<boolean> {
  const bodyText = await page.locator('body').innerText().catch(() => '');
  return isRetryableLoginPageText(bodyText);
}

export async function checkForCaptcha(page: Page): Promise<void> {
  const frame = page.locator(SEL.arkoseFrame).first();
  if (await frame.isVisible().catch(() => false)) {
    throw new LoginFlowError('captcha_required', 'arkose challenge presented');
  }
}

export async function isVisibleSoon(page: Page, selector: string, timeoutMs: number): Promise<boolean> {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait until the field that just submitted is detached — i.e. the form
 * actually advanced. Without this, the next step's waitFor races against
 * an unchanged DOM. A persistent selector across steps is fine; the next
 * step's check will catch the real situation.
 */
export async function waitForAdvance(page: Page, currentSelector: string, timeoutMs: number): Promise<void> {
  try {
    await page.locator(currentSelector).first().waitFor({ state: 'detached', timeout: timeoutMs });
  } catch {
    // Persistent selector — non-fatal.
  }
}

export async function clickNamedButtonOrPressEnter(page: Page, names: readonly string[]): Promise<void> {
  if (await clickVisibleNamedControl(page, names)) return;
  await page.keyboard.press('Enter');
}

export async function clickVisibleNamedControl(page: Page, names: readonly string[]): Promise<boolean> {
  const pattern = new RegExp(`^(${names.map(escapeRegExp).join('|')})$`, 'i');
  const roleButton = page.getByRole('button', { name: pattern }).first();
  if (await isVisibleAndEnabled(roleButton)) {
    if (await roleButton.click({ timeout: 3_000 }).then(() => true).catch(() => false)) return true;
  }

  const roleLink = page.getByRole('link', { name: pattern }).first();
  if (await isVisibleAndEnabled(roleLink)) {
    if (await roleLink.click({ timeout: 3_000 }).then(() => true).catch(() => false)) return true;
  }

  const textControl = page.locator('button, a, [role="button"], [role="link"]').filter({ hasText: pattern }).first();
  if (await isVisibleAndEnabled(textControl)) {
    if (await textControl.click({ timeout: 3_000 }).then(() => true).catch(() => false)) return true;
  }

  return false;
}

export async function enterTextLikeUser(page: Page, field: Locator, value: string): Promise<void> {
  await field.click();
  await humanDelay(50, 150);
  await field.press('Control+A').catch(() => undefined);
  await field.press('Meta+A').catch(() => undefined);
  await field.press('Backspace').catch(() => undefined);
  await humanDelay(30, 80);

  const charDelay = await humanTypeDelay();
  await page.keyboard.type(value, { delay: charDelay });

  const typed = await field.inputValue().catch(() => '');
  if (typed === value) return;

  // X's React-controlled inputs occasionally ignore synthetic key events in
  // headless sessions. Use the native setter + input/change events as a
  // fallback so React state and the DOM value stay in sync.
  await field.evaluate((el, text) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, text);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await page.waitForTimeout(150);
}

export async function didLeaveUsernameStep(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.locator(SEL.passwordInput).first().isVisible().catch(() => false)) return true;
    if (await page.locator(SEL.arkoseFrame).first().isVisible().catch(() => false)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

export async function captureDebug(page: Page): Promise<string> {
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
    const visibleText = (await page.locator('body').innerText().catch(() => ''))
      .slice(0, 200)
      .replace(/\s+/g, ' ');
    return `url=${url} title=${title} inputs(${inputCount})=[${inputs.join(' ; ')}] body~${visibleText}`;
  } catch {
    return 'captureDebug failed';
  }
}

export async function extractCookies(context: BrowserContext): Promise<XLoginCookies> {
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

export async function isLoggedInAs(page: Page, username: string): Promise<boolean> {
  const bodyText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  return bodyText.includes(`@${username.toLowerCase()}`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function isVisibleAndEnabled(locator: Locator): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) return false;
  return locator.isEnabled().catch(() => true);
}
