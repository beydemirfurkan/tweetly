import * as path from 'path';
import type { Page } from 'patchright';
import type { LoginJobFailureReason } from './login.types';

const DATA_ROOT = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');

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
  return path.join(DATA_ROOT, 'user-data', safe);
}

/**
 * Attach a network listener that captures X onboarding error bodies. The
 * returned array is populated lazily as `/1.1/onboarding/task.json` responses
 * come back with status ≥ 400 — callers inspect the most recent entry when
 * the username step fails to advance.
 */
export function collectOnboardingErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/1.1/onboarding/task.json') || response.status() < 400) return;

    void response
      .text()
      .then((body) => errors.push(truncate(body, 500)))
      .catch((err: unknown) => {
        const detail = err instanceof Error ? err.message : String(err);
        errors.push(truncate(detail, 200));
      });
  });
  return errors;
}
