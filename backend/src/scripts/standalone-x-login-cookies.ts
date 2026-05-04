import * as fs from 'fs';
import { createHmac } from 'crypto';
import * as path from 'path';

import * as dotenv from 'dotenv';
import { chromium, type BrowserContext, type Locator, type Page } from 'patchright';

import { LOGIN_INIT_SCRIPT } from '../x-automation/login/login-stealth';
import {
  humanDelay,
  humanTypeDelay,
  humanWarmup,
  moveMouseRandomly,
  randomViewport,
} from '../x-automation/login/login-humanize';

dotenv.config({ path: path.resolve(process.cwd(), '..', '.env'), override: false });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false });

const LOGIN_URL = 'https://x.com/i/flow/login';
const HOME_URL_PREFIX = 'https://x.com/home';
const DATA_ROOT = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
const STEP_TIMEOUT_MS = parseInt(process.env.STANDALONE_X_STEP_TIMEOUT_MS ?? '30000', 10);
const NAV_TIMEOUT_MS = parseInt(process.env.STANDALONE_X_NAV_TIMEOUT_MS ?? '60000', 10);
const HEADFUL = (process.env.STANDALONE_X_HEADFUL ?? 'true').toLowerCase() !== 'false';
const SLOWMO_MS = parseInt(process.env.STANDALONE_X_SLOWMO_MS ?? '0', 10);
const WRITE_COOKIES = (process.env.STANDALONE_X_WRITE_COOKIES ?? 'false').toLowerCase() === 'true';
const CLEAR_PROFILE = (process.env.STANDALONE_X_CLEAR_PROFILE ?? 'false').toLowerCase() === 'true';

const SEL = {
  usernameInput:
    'input[autocomplete="username"], input[name="text"][type="text"], input[data-testid="ocfEnterTextTextInput"]',
  passwordInput: 'input[name="password"], input[autocomplete="current-password"]',
  challengeInput: 'input[data-testid="ocfEnterTextTextInput"]',
  totpInput: 'input[name="text"][autocomplete="one-time-code"], input[data-testid="ocfEnterTextTextInput"]',
  loginSubmit: '[data-testid="LoginForm_Login_Button"]',
  arkoseFrame: 'iframe[src*="arkoselabs"], iframe[title*="arkose" i]',
} as const;

const BUTTON_TEXT = {
  next: ['Ileri', 'İleri', 'Next', 'Devam', 'Continue'],
  login: ['Giris yap', 'Giriş yap', 'Log in', 'Login'],
  retry: ['Yeniden dene', 'Retry', 'Try again'],
} as const;

interface ExtractedCookies {
  authToken: string;
  ct0: string;
  twid: string | null;
}

interface OnboardingFailure {
  reason: string;
  detail: string;
}

interface StandaloneLoginConfig {
  username: string;
  password: string;
  email: string | null;
  totpSecret: string | null;
  profileDir: string;
}

type BrowserCookie = Awaited<ReturnType<BrowserContext['cookies']>>[number];

async function main(): Promise<void> {
  const config = readConfig();

  if (CLEAR_PROFILE && fs.existsSync(config.profileDir)) fs.rmSync(config.profileDir, { recursive: true, force: true });
  fs.mkdirSync(config.profileDir, { recursive: true });

  const startedAt = Date.now();
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  const onboardingErrors: string[] = [];

  try {
    const vp = randomViewport();
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: !HEADFUL,
      slowMo: SLOWMO_MS || undefined,
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
    captureOnboardingErrors(page, onboardingErrors);

    const preLogin = await tryPreLoginSession(context, page, config.username);
    if (preLogin) {
      reportSuccess(config, context, page, preLogin.screenName, preLogin.cookies, startedAt);
      return;
    }

    await performLoginFlow(page, config, onboardingErrors);
    const cookies = await extractCookies(context);
    const screenName = await resolveScreenName(context, page, cookies, config.username);
    reportSuccess(config, context, page, screenName, cookies, startedAt);
  } catch (err) {
    const debugFile = page ? writeDebugFile(config.username, page, err) : null;
    console.error(JSON.stringify({
      ok: false,
      reason: classifyError(err, onboardingErrors),
      detail: err instanceof Error ? err.message : String(err),
      debugFile,
      profileDir: config.profileDir,
      proxy: 'disabled',
      headful: HEADFUL,
      durationMs: Date.now() - startedAt,
    }, null, 2));
    process.exitCode = 1;
  } finally {
    try {
      if (context) await context.close();
    } catch {}
  }
}

async function reportSuccess(
  config: StandaloneLoginConfig,
  context: BrowserContext,
  page: Page,
  screenName: string,
  cookies: ExtractedCookies,
  startedAt: number,
): Promise<void> {
  const cookieFile = WRITE_COOKIES ? writeCookieFile(config.username, cookies, await context.cookies(['https://x.com']).catch(() => [] as BrowserCookie[])) : null;
  console.log(JSON.stringify({
    ok: true,
    screenName,
    cookies: {
      hasAuthToken: Boolean(cookies.authToken),
      hasCt0: Boolean(cookies.ct0),
      hasTwid: Boolean(cookies.twid),
    },
    cookieFile,
    profileDir: config.profileDir,
    proxy: 'disabled',
    headful: HEADFUL,
    durationMs: Date.now() - startedAt,
  }, null, 2));
}

function readConfig(): StandaloneLoginConfig {
  const username = requiredEnv('X_LOGIN_USERNAME').replace(/^@+/, '');
  return {
    username,
    password: requiredEnv('X_LOGIN_PASSWORD'),
    email: optionalEnv('X_LOGIN_EMAIL'),
    totpSecret: optionalEnv('X_LOGIN_TOTP_SECRET'),
    profileDir: path.resolve(
      optionalEnv('STANDALONE_X_PROFILE_DIR') ?? path.join(DATA_ROOT, 'standalone-x-login', safeFileName(username)),
    ),
  };
}

function captureOnboardingErrors(page: Page, onboardingErrors: string[]): void {
  page.on('response', async (response) => {
    if (!response.url().includes('/1.1/onboarding/task.json')) return;
    if (response.status() < 400) return;
    onboardingErrors.push(await response.text().catch(() => `${response.status()} ${response.statusText()}`));
  });
}

async function tryPreLoginSession(
  context: BrowserContext,
  page: Page,
  username: string,
): Promise<{ screenName: string; cookies: ExtractedCookies } | null> {
  try {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    await humanDelay(1000, 2000);
    const url = page.url();
    if (!url.startsWith(HOME_URL_PREFIX)) return null;
    const bodyText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
    if (!bodyText.includes(`@${username.toLowerCase()}`)) return null;
    const cookies = await extractCookies(context);
    return { screenName: username, cookies };
  } catch {
    return null;
  }
}

async function performLoginFlow(
  page: Page,
  config: StandaloneLoginConfig,
  onboardingErrors: string[],
): Promise<void> {
  await page.goto('https://x.com/', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  await humanWarmup(page);
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
  await humanDelay(500, 1200);
  await moveMouseRandomly(page);
  await submitUsername(page, config.username, onboardingErrors);
  await handleIdentifierChallenge(page, config.email ?? config.username);
  await submitPassword(page, config.password, onboardingErrors);
  await handleTotpIfNeeded(page, config.totpSecret);
  await waitForHomeOrClassify(page, onboardingErrors);
}

async function submitUsername(page: Page, username: string, onboardingErrors: string[]): Promise<void> {
  await waitForUsernameInput(page);
  await enterTextLikeUser(page, page.locator(SEL.usernameInput).first(), username);
  await humanDelay(200, 500);
  await clickNamedControl(page, BUTTON_TEXT.next);
  await waitForUsernameStepAdvance(page, onboardingErrors);
  if (await isVisibleSoon(page, SEL.arkoseFrame, 2000)) {
    throw new Error('captcha_required: X presented Arkose challenge');
  }
}

async function handleIdentifierChallenge(page: Page, challengeValue: string): Promise<void> {
  if (!(await isVisibleSoon(page, SEL.challengeInput, 5000))) return;
  await enterTextLikeUser(page, page.locator(SEL.challengeInput).first(), challengeValue.trim());
  await humanDelay(200, 400);
  await clickNamedControl(page, BUTTON_TEXT.next);
  await page.waitForTimeout(2500);
}

async function submitPassword(page: Page, password: string, onboardingErrors: string[]): Promise<void> {
  await waitForPasswordInput(page, onboardingErrors);
  await enterTextLikeUser(page, page.locator(SEL.passwordInput).first(), password);
  await humanDelay(200, 500);
  const submit = page.locator(SEL.loginSubmit).first();
  if (await isVisibleAndEnabled(submit)) await submit.click();
  else await clickNamedControl(page, BUTTON_TEXT.login);
}

async function handleTotpIfNeeded(page: Page, totpSecret: string | null): Promise<void> {
  if (!(await isVisibleSoon(page, SEL.totpInput, 5000))) return;
  if (!totpSecret) throw new Error('verification_required: X requested a code/TOTP but X_LOGIN_TOTP_SECRET is not set');
  await enterTextLikeUser(page, page.locator(SEL.totpInput).first(), generateTotp(totpSecret));
  await humanDelay(150, 350);
  await clickNamedControl(page, BUTTON_TEXT.next);
}

async function waitForUsernameInput(page: Page): Promise<void> {
  const field = page.locator(SEL.usernameInput).first();
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (await isVisibleSoon(page, SEL.usernameInput, 8000)) return;
    if (await hasRetryableLoginError(page)) {
      await clickNamedControl(page, BUTTON_TEXT.retry);
      await humanDelay(1500, 3000);
      if (await field.isVisible().catch(() => false)) return;
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      await humanDelay(500, 1500);
      continue;
    }
    if (await clickVisibleNamedControl(page, BUTTON_TEXT.login)) {
      await humanDelay(1000, 2500);
      continue;
    }
    break;
  }
  throw new Error(`username_input_missing: ${await captureDebug(page)}`);
}

async function waitForUsernameStepAdvance(page: Page, onboardingErrors: string[]): Promise<void> {
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const onboardingFailure = classifyOnboardingError(onboardingErrors.at(-1));
    if (onboardingFailure) throw new Error(`${onboardingFailure.reason}: ${onboardingFailure.detail}`);
    if (await page.locator(SEL.passwordInput).first().isVisible().catch(() => false)) return;
    if (await page.locator(SEL.challengeInput).first().isVisible().catch(() => false)) return;
    if (await page.locator(SEL.arkoseFrame).first().isVisible().catch(() => false)) return;
    await page.waitForTimeout(500);
  }
  throw new Error(`username_step_stuck: ${await captureDebug(page)}`);
}

async function waitForPasswordInput(page: Page, onboardingErrors: string[]): Promise<void> {
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const onboardingFailure = classifyOnboardingError(onboardingErrors.at(-1));
    if (onboardingFailure) throw new Error(`${onboardingFailure.reason}: ${onboardingFailure.detail}`);
    if (await page.locator(SEL.passwordInput).first().isVisible().catch(() => false)) return;
    if (await page.locator(SEL.arkoseFrame).first().isVisible().catch(() => false)) {
      throw new Error('captcha_required: X presented Arkose challenge');
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`password_input_missing: ${await captureDebug(page)}`);
}

async function waitForHomeOrClassify(page: Page, onboardingErrors: string[]): Promise<void> {
  const deadline = Date.now() + NAV_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const onboardingFailure = classifyOnboardingError(onboardingErrors.at(-1));
    if (onboardingFailure) throw new Error(`${onboardingFailure.reason}: ${onboardingFailure.detail}`);
    if (page.url().startsWith(HOME_URL_PREFIX)) return;
    const body = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
    if (body.includes('wrong password') || body.includes('yanlış şifre') || body.includes('şifre yanlış')) {
      throw new Error('invalid_credentials: password rejected');
    }
    if (body.includes('too many attempts') || body.includes('çok fazla deneme') || body.includes('try again later')) {
      throw new Error('login_cooldown: X reports too many attempts');
    }
    if (body.includes('verification code') || body.includes('doğrulama kodu')) {
      throw new Error('verification_required: X requested verification code');
    }
    if (await page.locator(SEL.arkoseFrame).first().isVisible().catch(() => false)) {
      throw new Error('captcha_required: X presented Arkose challenge');
    }
    await page.waitForTimeout(750);
  }
  throw new Error(`home_not_reached: ${await captureDebug(page)}`);
}

async function enterTextLikeUser(page: Page, field: Locator, value: string): Promise<void> {
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

  await field.evaluate((el, text) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, text);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await page.waitForTimeout(200);
}

async function clickNamedControl(page: Page, names: readonly string[]): Promise<void> {
  if (await clickVisibleNamedControl(page, names)) return;
  await humanDelay(100, 250);
  await page.keyboard.press('Enter');
}

async function clickVisibleNamedControl(page: Page, names: readonly string[]): Promise<boolean> {
  const pattern = new RegExp(`^(${names.map(escapeRegExp).join('|')})$`, 'i');
  const candidates = [
    page.getByRole('button', { name: pattern }).first(),
    page.getByRole('link', { name: pattern }).first(),
    page.locator('button, a, [role="button"], [role="link"]').filter({ hasText: pattern }).first(),
  ];

  for (const candidate of candidates) {
    if (await isVisibleAndEnabled(candidate)) {
      if (await candidate.click({ timeout: 3000 }).then(() => true).catch(() => false)) return true;
    }
  }
  return false;
}

async function isVisibleAndEnabled(locator: Locator): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) return false;
  return locator.isEnabled().catch(() => true);
}

async function isVisibleSoon(page: Page, selector: string, timeoutMs: number): Promise<boolean> {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function hasRetryableLoginError(page: Page): Promise<boolean> {
  const body = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  return ['bir sorun oluştu', 'yeniden yüklemeyi dene', 'something went wrong', 'try reloading'].some((needle) =>
    body.includes(needle),
  );
}

function classifyOnboardingError(raw: string | undefined): OnboardingFailure | null {
  if (!raw) return null;
  const text = raw.toLowerCase();
  if (text.includes('could not log you in now') || text.includes('try again later')) {
    return { reason: 'login_cooldown', detail: 'X onboarding rejected login temporarily; try again later' };
  }
  if (text.includes('could not authenticate') || text.includes('invalid') && text.includes('credential')) {
    return { reason: 'invalid_credentials', detail: 'X onboarding rejected credentials' };
  }
  if (text.includes('captcha') || text.includes('arkose')) {
    return { reason: 'captcha_required', detail: 'X requested captcha' };
  }
  return null;
}

async function extractCookies(context: BrowserContext): Promise<ExtractedCookies> {
  const cookies = await context.cookies(['https://x.com', 'https://twitter.com']);
  const byName = new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
  const authToken = byName.get('auth_token');
  const ct0 = byName.get('ct0');
  if (!authToken || !ct0) {
    throw new Error(`cookies_missing: auth_token=${Boolean(authToken)} ct0=${Boolean(ct0)}`);
  }
  return { authToken, ct0, twid: byName.get('twid') ?? null };
}

async function resolveScreenName(
  context: BrowserContext,
  page: Page,
  cookies: ExtractedCookies,
  fallbackUsername: string,
): Promise<string> {
  const fromPage = await page.locator('body').innerText().catch(() => '');
  if (fromPage.toLowerCase().includes(`@${fallbackUsername.toLowerCase()}`)) return fallbackUsername;

  const response = await context.request.get('https://x.com/i/api/1.1/account/settings.json', {
    headers: {
      authorization:
        'Bearer AAAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCO7f2D9rVYlr5XXedg%3D' +
        'fHQEkLq0Wrzvi4P7v1JpFbkZdTNMmwdRUUOZWeeQalhjfVEhW',
      'x-csrf-token': cookies.ct0,
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': 'tr',
    },
  });
  if (!response.ok()) return fallbackUsername;
  const json = (await response.json().catch(() => null)) as { screen_name?: unknown } | null;
  return typeof json?.screen_name === 'string' && json.screen_name ? json.screen_name : fallbackUsername;
}

function writeCookieFile(username: string, extracted: ExtractedCookies, allCookies: BrowserCookie[]): string {
  const dir = path.join(DATA_ROOT, 'standalone-x-login-cookies');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${timestamp()}-${safeFileName(username)}.json`);
  fs.writeFileSync(file, JSON.stringify({ extracted, allCookies }, null, 2));
  return file;
}

function writeDebugFile(username: string, page: Page, err: unknown): string {
  const dir = path.join(DATA_ROOT, 'standalone-x-login-errors');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${timestamp()}-${safeFileName(username)}.json`);
  const payload = {
    error: err instanceof Error ? err.message : String(err),
    url: page.url(),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

async function captureDebug(page: Page): Promise<string> {
  const url = page.url();
  const title = await page.title().catch(() => '?');
  const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 240).replace(/\s+/g, ' ');
  const inputCount = await page.locator('input').count().catch(() => -1);
  return `url=${url} title=${title} inputs=${inputCount} body~${body}`;
}

function classifyError(err: unknown, onboardingErrors: string[]): string {
  const explicit = classifyOnboardingError(onboardingErrors.at(-1));
  if (explicit) return explicit.reason;
  const message = err instanceof Error ? err.message : String(err);
  const prefix = message.split(':', 1)[0];
  return prefix || 'unknown';
}

function generateTotp(secret: string, now = Date.now()): string {
  const key = decodeBase32(secret);
  const counter = Math.floor(now / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

function decodeBase32(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (!normalized) throw new Error('invalid_totp_secret: empty base32 secret');

  let bits = '';
  for (const char of normalized) {
    const value = alphabet.indexOf(char);
    if (value === -1) throw new Error('invalid_totp_secret: non-base32 character');
    bits += value.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function safeFileName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').slice(0, 80) || 'x-account';
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
