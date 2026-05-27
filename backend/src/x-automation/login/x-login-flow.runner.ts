import { Logger } from '@nestjs/common';
import type { Page, Locator } from 'patchright';
import { LoginFlowError } from './login-error';
import { ERROR_TEXT, HOME_URL_PREFIX, LOGIN_URL, SEL } from './login-selectors';
import type { XLoginInput } from './login.types';
import { humanDelay, humanWarmup, moveMouseRandomly } from './login-humanize';
import { generateTotp } from './totp';
import {
  captureDebug,
  checkForCaptcha,
  classifyVisibleFailure,
  clickNamedButtonOrPressEnter,
  didLeaveUsernameStep,
  enterTextLikeUser,
  hasRetryableLoginPageError,
  isVisibleSoon,
  clickVisibleNamedControl,
  matchesErrorText,
  waitForAdvance,
} from './login-page.utils';
import {
  classifyByUrl,
  classifyOnboardingError,
  type OnboardingErrorLog,
} from './login-classifiers';
import { runStep, type CancelCheck } from './x-login-step';
import { LOGIN_TIMING } from './x-login-context.factory';

export interface LoginFlowOptions {
  log: Logger;
  page: Page;
  input: XLoginInput & { username: string };
  onboardingErrors: OnboardingErrorLog;
  checkCancel: CancelCheck;
}

/**
 * Drives the X login DOM dance: warm-up → username → optional challenge
 * → password → optional 2FA → verify-home. Each step is wrapped in
 * `runStep` so cancel probes + debug capture stay uniform across the flow.
 */
export async function runLoginFlow(opts: LoginFlowOptions): Promise<void> {
  const { log, page, input, onboardingErrors, checkCancel } = opts;

  // Warm-up: visit x.com root before the login flow so X sees the same
  // pattern a real user does (homepage → click "Sign in"). Skipped if the
  // persistent profile already has cookies for the target account
  // (reauth-on-warm-profile shouldn't double-fetch).
  await runStep('navigate', async () => {
    try {
      await page.goto('https://x.com/', {
        waitUntil: 'domcontentloaded',
        timeout: LOGIN_TIMING.NAV_TIMEOUT_MS,
      });
      await humanWarmup(page);
    } catch {
      // Best-effort warm-up; proceed to login URL even if root failed.
    }
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await humanDelay(500, 1200);
    await moveMouseRandomly(page);
  }, { log, page, checkCancel });

  await runStep('username', async () => {
    // Capture the step-start so classifyOnboardingError only sees errors
    // that arrived inside *this* step's window — a stale 500 from a
    // previous flow no longer flips the classification.
    const stepStartedAt = Date.now();
    const field = await waitForUsernameInput(page, checkCancel, log);
    // X's React form ignores DOM-set values (fill() bypass): we must dispatch
    // real keyboard events. Click for focus, type per-char, then submit.
    await enterTextLikeUser(page, field, input.username);
    await submitUsernameStep(page, field, onboardingErrors, stepStartedAt);
  }, { log, page, checkCancel });

  // X may now show:
  //  (a) password screen directly, or
  //  (b) "unusual login" challenge asking for email/handle, or
  //  (c) Arkose captcha iframe
  await checkForCaptcha(page);

  if (await isVisibleSoon(page, SEL.challengeInput, 4000)) {
    await runStep('challenge', async () => {
      const challengeValue = (input.email ?? input.username).trim();
      const field = page.locator(SEL.challengeInput).first();
      await enterTextLikeUser(page, field, challengeValue);
      await clickNamedButtonOrPressEnter(page, SEL.nextButtonTexts);
      await waitForAdvance(page, SEL.challengeInput, 6000);
    }, { log, checkCancel });
  }

  await checkForCaptcha(page);

  await runStep('password', async () => {
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
  }, { log, checkCancel });

  if (await isVisibleSoon(page, SEL.totpInput, 5000)) {
    if (!input.totpSecret) {
      throw new LoginFlowError('email_verification_required', 'X prompted for a verification code');
    }
    await runStep('2fa', async () => {
      const code = generateTotp(input.totpSecret!);
      const field = page.locator(SEL.totpInput).first();
      await enterTextLikeUser(page, field, code);
      await clickNamedButtonOrPressEnter(page, SEL.nextButtonTexts);
    }, { log, checkCancel });
  }

  await verifyHome(page, checkCancel, log);
}

async function verifyHome(page: Page, checkCancel: CancelCheck, log: Logger): Promise<void> {
  await runStep('verify-home', async () => {
    try {
      await page.waitForURL((url) => url.toString().startsWith(HOME_URL_PREFIX), {
        timeout: LOGIN_TIMING.STEP_TIMEOUT_MS,
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
  }, { log, checkCancel });
}

async function waitForUsernameInput(page: Page, checkCancel: CancelCheck, log: Logger): Promise<Locator> {
  const field = page.locator(SEL.usernameInput).first();
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Each retry attempt is a natural cancellation point — the retry loop
    // can spend ~5s per attempt waiting on a retryable error page, and we
    // don't want a user-cancel to sit through all of them.
    await checkCancel();
    try {
      await field.waitFor({ state: 'visible' });
      return field;
    } catch (err) {
      const retryableLoginPage = await hasRetryableLoginPageError(page);
      if (!retryableLoginPage && await clickVisibleNamedControl(page, SEL.loginButtonTexts)) {
        log.warn(
          `X login rendered landing page before username input; clicking login entry point ` +
            `attempt=${attempt}/${maxAttempts}.`,
        );
        await page.waitForTimeout(2_000);
        continue;
      }
      if (!retryableLoginPage) throw err;
    }

    log.warn(
      `X login rendered retryable error page before username input; ` +
        `clicking retry button and reloading login flow attempt=${attempt}/${maxAttempts}.`,
    );
    await clickNamedButtonOrPressEnter(page, SEL.retryButtonTexts);
    await page.waitForTimeout(2_000);
    if (await field.isVisible().catch(() => false)) return field;
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: LOGIN_TIMING.NAV_TIMEOUT_MS });
    await page.waitForTimeout(1_000);
  }

  const ctx = await captureDebug(page);
  throw new LoginFlowError(
    'home_not_reached',
    `retryable login page before username input after ${maxAttempts} attempts. ${ctx}`,
  );
}

async function submitUsernameStep(
  page: Page,
  field: Locator,
  onboardingErrors: OnboardingErrorLog,
  stepStartedAt: number,
): Promise<void> {
  await clickNamedButtonOrPressEnter(page, SEL.nextButtonTexts);
  if (await didLeaveUsernameStep(page, 4000)) return;

  await field.press('Enter');
  if (await didLeaveUsernameStep(page, 4000)) return;

  await clickNamedButtonOrPressEnter(page, SEL.nextButtonTexts);
  if (await didLeaveUsernameStep(page, 4000)) return;

  await checkForCaptcha(page);
  // Only classify errors that arrived inside this step's window so a
  // stale telemetry 500 from a previous flow can't shadow the real
  // login error.
  const apiFailure = classifyOnboardingError(onboardingErrors.lastSince(stepStartedAt));
  if (apiFailure) throw new LoginFlowError(apiFailure.reason, apiFailure.detail);
  const visibleFailure = await classifyVisibleFailure(page);
  if (visibleFailure) throw visibleFailure;
  const ctx = await captureDebug(page);
  throw new LoginFlowError('home_not_reached', `username step did not advance. ${ctx}`);
}
