/**
 * X (Twitter) login flow selectors.
 *
 * Twitter ships UI changes regularly; when this file goes stale, the failure
 * mode is `LoginFlowError('unknown', 'step <name>: timeout waiting for ...')`.
 * Re-record by running with LOGIN_DEBUG_HEADFUL=true and inspecting devtools.
 *
 * Strategy:
 *  - Prefer data-testid (most stable across UI/locale changes).
 *  - Fall back to autocomplete / name attributes (HTML semantics, also stable).
 *  - For buttons we use role + multi-locale text since X has no testid on the
 *    Next/Login buttons in the login flow as of 2026-04.
 */

export const LOGIN_URL = 'https://x.com/i/flow/login';
export const HOME_URL_PREFIX = 'https://x.com/home';

export const SEL = {
  // Step 1: username/email input (same field handles both)
  usernameInput: 'input[autocomplete="username"]',

  // Step 1.5: unusual-login challenge re-prompts the same input asking for the
  // *other* identifier (email if you typed handle, or vice-versa).
  challengeInput: 'input[data-testid="ocfEnterTextTextInput"]',

  // Step 2: password
  passwordInput: 'input[name="password"], input[autocomplete="current-password"]',
  loginSubmit: '[data-testid="LoginForm_Login_Button"]',

  // Step 3: 2FA TOTP code
  totpInput: 'input[name="text"][autocomplete="one-time-code"], input[data-testid="ocfEnterTextTextInput"]',

  // Generic "Next" button — text-based, locale-aware. Order matters (most
  // specific first) so Locator.first() picks the visible primary CTA.
  nextButtonTexts: ['İleri', 'Next', 'Devam', 'Continue'],
  loginButtonTexts: ['Giriş yap', 'Log in', 'Login'],

  // Error / challenge surfaces
  errorBanner: 'div[role="alert"], [data-testid="toast"]',
  arkoseFrame: 'iframe[src*="arkoselabs"], iframe[title*="arkose" i]',
} as const;

export const ERROR_TEXT = {
  invalidCredentials: [
    'sayfaya erişimi durdurduk',
    'kullanıcı adınız veya şifreniz',
    'yanlış şifre',
    'şifre yanlış',
    'şifrenizi doğru',
    'wrong password',
    'incorrect password',
    'password you entered was incorrect',
    'did not match our records',
    "couldn't log you in",
  ],
  cooldown: [
    'çok fazla deneme',
    'too many attempts',
    'try again later',
    'rate limit',
  ],
  emailChallenge: [
    'doğrulama kodu',
    'e-posta adresini onayla',
    'e-posta adresini doğrula',
    'e-posta veya telefon',
    'verification code',
    'we sent you a code',
    'enter the code',
  ],
  suspiciousLogin: [
    'olağandışı giriş etkinliği',
    'şüpheli giriş',
    'unusual login activity',
    'suspicious login',
    'temporarily limited',
    'account has been locked',
  ],
} as const;
