import { chromium, type BrowserContext } from 'patchright';
import { optionalBrowserChannel } from '@/x-automation/browser/browser-channel';
import { clearStaleLocks } from '@/x-automation/browser/clear-stale-locks';
import { LOGIN_INIT_SCRIPT } from './login-stealth';
import { randomViewport } from './login-humanize';
import { resolveLoginProfileDir, stripAt } from './login-classifiers';
import { resolveProxy } from './proxy-resolver';
import { envBackedConfig } from '@/config/process-env-shim';

function loginConfig(): {
  userAgent: string | null;
  stepTimeoutMs: number;
  navTimeoutMs: number;
  headful: boolean;
  slowMoMs: number;
} {
  const config = envBackedConfig();
  return {
    userAgent: config.getOptionalString('LOGIN_USER_AGENT'),
    stepTimeoutMs: config.getNumber('LOGIN_STEP_TIMEOUT_MS', 20_000),
    navTimeoutMs: config.getNumber('LOGIN_NAV_TIMEOUT_MS', 45_000),
    headful: config.getBoolean('LOGIN_DEBUG_HEADFUL', false),
    slowMoMs: config.getNumber('LOGIN_DEBUG_SLOWMO_MS', 0),
  };
}

export const LOGIN_TIMING = {
  get STEP_TIMEOUT_MS(): number {
    return loginConfig().stepTimeoutMs;
  },
  get NAV_TIMEOUT_MS(): number {
    return loginConfig().navTimeoutMs;
  },
} as const;

export const LOGIN_FLAGS = {
  get HEADFUL(): boolean {
    return loginConfig().headful;
  },
} as const;

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
  const cfg = loginConfig();
  const username = stripAt(input.username);
  const profileDir = resolveLoginProfileDir(input.targetAccountId, username, input.proxyCountry);
  clearStaleLocks(profileDir);
  const vp = randomViewport();
  const proxy = resolveProxy(input.proxyCountry);
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: !cfg.headful,
    ...optionalBrowserChannel(),
    slowMo: cfg.slowMoMs || undefined,
    proxy: proxy ?? undefined,
    ...(cfg.userAgent ? { userAgent: cfg.userAgent } : {}),
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
  context.setDefaultTimeout(cfg.stepTimeoutMs);
  context.setDefaultNavigationTimeout(cfg.navTimeoutMs);
  await context.addInitScript(LOGIN_INIT_SCRIPT);
  return { profileDir, context };
}
