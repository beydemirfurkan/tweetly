import * as path from 'path';
import type { Page } from 'patchright';
import type { LoginJobFailureReason } from './login.types';
import { envBackedConfig } from '@/config/process-env-shim';

// Resolved lazily on each `resolveLoginProfileDir` call rather than at
// module load so tests that mutate DATA_DIR between cases see the change
// without `jest.resetModules`.
function dataRoot(): string {
  return envBackedConfig().getString('DATA_DIR', path.resolve(process.cwd(), 'data'));
}

export function stripAt(s: string): string {
  return s.trim().replace(/^@+/, '');
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

export function parseUserIdFromTwid(twid: string | null): string | null {
  if (!twid) return null;
  // twid cookie format: u%3D<userId>  (URL-encoded "u=<userId>")
  const decoded = decodeURIComponent(twid);
  const m = decoded.match(/^u=(\d+)/);
  return m ? m[1] : null;
}

export function classifyOnboardingError(
  raw: string | undefined,
): { reason: LoginJobFailureReason; detail: string } | null {
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized.includes('could not log you in now') || normalized.includes('try again later')) {
    return { reason: 'login_cooldown', detail: 'X onboarding rejected login temporarily; try again later' };
  }
  if (normalized.includes('could not authenticate') || normalized.includes('did not match our records')) {
    return { reason: 'invalid_credentials', detail: 'X onboarding rejected credentials' };
  }
  // Captcha can surface in the onboarding response body too — the DOM
  // probe usually catches it first, but the API signal is a useful
  // fallback when the iframe hasn't rendered yet.
  if (normalized.includes('captcha') || normalized.includes('arkose')) {
    return { reason: 'captcha_required', detail: 'X requested captcha' };
  }
  return null;
}

/**
 * Classify a stuck-not-on-home URL into a specific failure_reason.
 * X parks blocked sessions at /account/access (locked), /account/access/
 * identity (phone challenge), and /login/error (bad creds) — all detectable
 * before any on-page text loads, which is faster + more reliable than
 * scraping the body.
 */
export function classifyByUrl(
  rawUrl: string,
): { reason: LoginJobFailureReason; detail: string } | null {
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
export function resolveLoginProfileDir(
  targetAccountId: string | null | undefined,
  username: string,
  proxyCountry?: string | null,
): string {
  const proxySuffix = targetAccountId || !proxyCountry ? '' : `-${proxyCountry.toLowerCase()}`;
  const safe = (targetAccountId ?? `login-${username.toLowerCase()}${proxySuffix}`).replace(
    /[^A-Za-z0-9._-]/g,
    '_',
  );
  return path.join(dataRoot(), 'user-data', safe);
}

export interface OnboardingErrorLog {
  /**
   * Most recent error whose receive-time is at or after `sinceMs`. Returns
   * undefined when the window has been quiet — letting callers fall
   * through to a DOM-side classification instead of reading a stale
   * telemetry error from a previous step.
   */
  lastSince(sinceMs: number): string | undefined;
  /** Current entry count — exposed for tests. */
  size(): number;
}

// Cap the in-memory entry count so a login that loops through many
// retries doesn't accumulate hundreds of telemetry payloads in the
// closure. `lastSince` is the only consumer; older entries can never
// be picked again once the step boundary has passed.
const ONBOARDING_ERROR_BUFFER_CAP = 20;

/**
 * Storage primitive for the onboarding-error log. Pulled out of
 * `collectOnboardingErrors` so unit tests can drive `push` directly
 * without standing up a fake Page. `push` is exposed on the returned
 * object but excluded from the public `OnboardingErrorLog` interface —
 * consumers only ever read from it.
 */
export function createOnboardingErrorLog(): OnboardingErrorLog & { push(body: string): void } {
  const entries: Array<{ at: number; body: string }> = [];
  return {
    push(body: string): void {
      entries.push({ at: Date.now(), body: truncate(body, 500) });
      if (entries.length > ONBOARDING_ERROR_BUFFER_CAP) entries.shift();
    },
    lastSince(sinceMs: number): string | undefined {
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].at >= sinceMs) return entries[i].body;
      }
      return undefined;
    },
    size(): number {
      return entries.length;
    },
  };
}

/**
 * Attach a network listener that captures X onboarding error bodies for
 * `/1.1/onboarding/task.json` responses with status ≥ 400. The returned
 * log is bounded and timestamped so callers can scope classification to
 * the current step window — a stale 500 from a telemetry endpoint
 * landing after the real login error no longer flips the classification.
 */
export function collectOnboardingErrors(page: Page): OnboardingErrorLog {
  const log = createOnboardingErrorLog();
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/1.1/onboarding/task.json') || response.status() < 400) return;

    void response
      .text()
      .then((body) => log.push(body))
      .catch((err: unknown) => {
        const detail = err instanceof Error ? err.message : String(err);
        log.push(detail);
      });
  });
  return log;
}
