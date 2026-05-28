import type { BrowserContext, Page } from 'patchright';
import { LoginFlowError } from './login-error';
import { extractCookies, isLoggedInAs } from './login-page.utils';
import { humanDelay } from './login-humanize';
import { HOME_URL_PREFIX } from './login-selectors';
import { truncate } from './login-classifiers';
import { X_PUBLIC_BEARER } from './x-public-bearer';
import { envBackedConfig } from '@/config/process-env-shim';
import type { XLoginCookies } from './login.types';

// Resolved on each call (rather than at module load) so test mutation of
// LOGIN_NAV_TIMEOUT_MS / LOGIN_SETTINGS_AUTH_RETRY between cases works
// without a module reset.
function timeoutCfg(): { navMs: number; retries: number; retryDelayMs: number } {
  const cfg = envBackedConfig();
  return {
    navMs: cfg.getNumber('LOGIN_NAV_TIMEOUT_MS', 45_000),
    retries: cfg.getNumber('LOGIN_SETTINGS_AUTH_RETRY', 1),
    retryDelayMs: cfg.getNumber('LOGIN_SETTINGS_AUTH_RETRY_DELAY_MS', 2500),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cheap pre-login probe: hit /home directly with the persistent context's
 * cookies. If X redirects us back to a logged-in /home and the visible
 * handle matches the expected username, we skip the full login flow.
 * Returns null on any failure so the caller falls through to a real login.
 */
export async function tryPreLoginSession(
  context: BrowserContext,
  page: Page,
  username: string,
): Promise<{ screenName: string; cookies: XLoginCookies } | null> {
  try {
    await page.goto(HOME_URL_PREFIX, { waitUntil: 'domcontentloaded', timeout: timeoutCfg().navMs });
    await humanDelay(1000, 2000);
    if (!page.url().startsWith(HOME_URL_PREFIX)) return null;
    if (!(await isLoggedInAs(page, username))) return null;
    const cookies = await extractCookies(context);
    return { screenName: username, cookies };
  } catch {
    return null;
  }
}

/**
 * Confirm the cookies we collected actually authenticate to X. We try the
 * on-page DOM signal first (faster), then fall back to the settings API.
 * Throws LoginFlowError on rejection so the caller surfaces a precise
 * failure reason instead of "home reached but session unusable".
 */
export async function verifyAuthenticatedSession(
  context: BrowserContext,
  page: Page,
  typedUsername: string,
  cookies: XLoginCookies,
): Promise<string> {
  if (await isLoggedInAs(page, typedUsername)) return typedUsername;

  const urls = [
    'https://api.x.com/1.1/account/settings.json',
    'https://x.com/i/api/1.1/account/settings.json',
  ];

  // Outer retry loop guards against the post-login session-sync race:
  // both shards may return 401/403 for a few seconds before settling.
  // We retry the *full* probe (both URLs) rather than each one in turn
  // so a per-shard outage doesn't burn the retry budget.
  let lastStatus: number | null = null;
  let lastAuthRejection: { status: number } | null = null;
  const { retries, retryDelayMs } = timeoutCfg();

  for (let attempt = 0; attempt <= retries; attempt++) {
    lastAuthRejection = null;

    for (const url of urls) {
      try {
        const res = await context.request.get(url, {
          headers: {
            'x-csrf-token': cookies.ct0,
            'authorization': `Bearer ${X_PUBLIC_BEARER}`,
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
          // Don't throw yet — record and let the outer attempt-loop retry.
          lastAuthRejection = { status: res.status() };
          continue;
        }
      } catch (err) {
        if (err instanceof LoginFlowError) throw err;
        const detail = err instanceof Error ? err.message : String(err);
        throw new LoginFlowError(
          'home_not_reached',
          `authenticated settings check errored: ${truncate(detail, 160)}`,
        );
      }
    }

    // Both URLs returned 401/403 this pass. Back off and try once more.
    if (lastAuthRejection && attempt < retries) {
      await sleep(retryDelayMs);
      continue;
    }
    break;
  }

  if (lastAuthRejection) {
    throw new LoginFlowError(
      'cookies_missing',
      `authenticated settings rejected session after retries (last_status=${lastAuthRejection.status})`,
    );
  }

  throw new LoginFlowError(
    'home_not_reached',
    `authenticated settings check failed (last_status=${lastStatus ?? '?'})`,
  );
}
