import type { BrowserContext, Page } from 'patchright';
import { LoginFlowError } from './login-error';
import { ERROR_TEXT, SEL } from './login-selectors';
import type { LoginJobFailureReason, XLoginCookies } from './login.types';

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

export async function classifyVisibleFailure(page: Page): Promise<LoginFlowError | null> {
  const mappings: Array<{ reason: LoginJobFailureReason; needles: readonly string[]; detail: string }> = [
    { reason: 'invalid_credentials', needles: ERROR_TEXT.invalidCredentials, detail: 'credentials rejected' },
    { reason: 'login_cooldown', needles: ERROR_TEXT.cooldown, detail: 'X reports too many attempts' },
    { reason: 'email_verification_required', needles: ERROR_TEXT.emailChallenge, detail: 'X requires email verification' },
    { reason: 'suspicious_login_blocked', needles: ERROR_TEXT.suspiciousLogin, detail: 'X blocked this login as suspicious' },
  ];

  for (const m of mappings) {
    if (await matchesErrorText(page, m.needles)) {
      return new LoginFlowError(m.reason, m.detail);
    }
  }
  return null;
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

export async function didLeaveUsernameStep(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.locator(SEL.passwordInput).first().isVisible().catch(() => false)) return true;
    if (await page.locator(SEL.challengeInput).first().isVisible().catch(() => false)) return true;
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
