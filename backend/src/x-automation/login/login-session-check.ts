import type { BrowserContext, Page } from 'patchright';
import { LoginFlowError } from './login-error';
import { extractCookies, isLoggedInAs } from './login-page.utils';
import { humanDelay } from './login-humanize';
import { HOME_URL_PREFIX } from './login-selectors';
import { truncate } from './login-classifiers';
import { X_PUBLIC_BEARER } from './x-public-bearer';
import type { XLoginCookies } from './login.types';

const NAV_TIMEOUT_MS = parseInt(process.env.LOGIN_NAV_TIMEOUT_MS ?? '45000', 10);

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
    await page.goto(HOME_URL_PREFIX, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
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
  let lastStatus: number | null = null;

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
        throw new LoginFlowError(
          'cookies_missing',
          `authenticated settings rejected session (status=${res.status()})`,
        );
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

  throw new LoginFlowError(
    'home_not_reached',
    `authenticated settings check failed (last_status=${lastStatus ?? '?'})`,
  );
}
