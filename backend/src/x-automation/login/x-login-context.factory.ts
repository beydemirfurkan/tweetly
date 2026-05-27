import { chromium, type BrowserContext } from 'patchright';
import { optionalBrowserChannel } from '@/x-automation/browser/browser-channel';
import { clearStaleLocks } from '@/x-automation/browser/clear-stale-locks';
import { LOGIN_INIT_SCRIPT } from './login-stealth';
import { randomViewport } from './login-humanize';
import { resolveLoginProfileDir, stripAt } from './login-classifiers';
import { resolveProxy } from './proxy-resolver';

const USER_AGENT = process.env.LOGIN_USER_AGENT?.trim() || null;
const STEP_TIMEOUT_MS = parseInt(process.env.LOGIN_STEP_TIMEOUT_MS ?? '20000', 10);
const NAV_TIMEOUT_MS = parseInt(process.env.LOGIN_NAV_TIMEOUT_MS ?? '45000', 10);
const HEADFUL = (process.env.LOGIN_DEBUG_HEADFUL ?? 'false').toLowerCase() === 'true';
const SLOWMO_MS = parseInt(process.env.LOGIN_DEBUG_SLOWMO_MS ?? '0', 10);

export const LOGIN_TIMING = { STEP_TIMEOUT_MS, NAV_TIMEOUT_MS } as const;
export const LOGIN_FLAGS = { HEADFUL } as const;

export interface LoginContextInput {
  targetAccountId: string | null | undefined;
  username: string;
  proxyCountry: string | null | undefined;
}

export interface LoginContextResult {
  profileDir: string;
  context: BrowserContext;
}

/**
 * Launches the persistent Patchright context the login flow runs inside.
 * Owns viewport randomisation, proxy resolution, init-script injection and
 * default timeouts so the orchestrator stays focused on flow control.
 */
export async function buildLoginContext(input: LoginContextInput): Promise<LoginContextResult> {
  const username = stripAt(input.username);
  const profileDir = resolveLoginProfileDir(input.targetAccountId, username, input.proxyCountry);
  clearStaleLocks(profileDir);
  const vp = randomViewport();
  const proxy = resolveProxy(input.proxyCountry);
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: !HEADFUL,
    ...optionalBrowserChannel(),
    slowMo: SLOWMO_MS || undefined,
    proxy: proxy ?? undefined,
    ...(USER_AGENT ? { userAgent: USER_AGENT } : {}),
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
  return { profileDir, context };
}
