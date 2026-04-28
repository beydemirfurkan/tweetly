import type { BrowserContext, Page } from 'patchright';
import { launch } from './browser';
import { config } from '../config';
import * as accounts from '../storage/accounts';
import { make } from '../utils/logger';

const log = make('importSession');

type CookieInput = Parameters<BrowserContext['addCookies']>[0][number];

function sessionCookie(name: string, value: string, domain: string): CookieInput {
  return {
    name,
    value,
    domain,
    path: '/',
    expires: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    httpOnly: true,
    secure: true,
    sameSite: 'None',
  };
}

function visibleCookie(name: string, value: string, domain: string): CookieInput {
  return {
    ...sessionCookie(name, value, domain),
    httpOnly: false,
  };
}

async function gotoHomeWithRetry(page: Page): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
      return;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`X home acilamadi, tekrar denenecek (${attempt}/3): ${msg}`);
      await page.waitForTimeout(2000 * attempt);
    }
  }

  throw lastError;
}

export function hasSessionImportEnv(): boolean {
  return Boolean(process.env.X_AUTH_TOKEN?.trim());
}

export async function importSession(accountId?: string): Promise<boolean> {
  const account = accountId
    ? accounts.getById(accountId)
    : accounts.list()[0];

  if (!account) {
    throw new Error('Aktif hesap bulunamadi');
  }

  log.info(`Session import: @${account.id}`);

  const { context, page } = await launch(account.id);
  const domains = ['.x.com', '.twitter.com'];
  const cookies: CookieInput[] = [];

  for (const domain of domains) {
    cookies.push(sessionCookie('auth_token', account.authToken, domain));
    if (account.authMulti) cookies.push(sessionCookie('auth_multi', account.authMulti, domain));
    if (account.ct0) cookies.push(visibleCookie('ct0', account.ct0, domain));
    if (account.twid) cookies.push(visibleCookie('twid', account.twid, domain));
  }

  try {
    await context.addCookies(cookies);
    await gotoHomeWithRetry(page);
    await page.waitForTimeout(5000);

    if (page.url().includes('/login') || page.url().includes('/i/flow')) {
      throw new Error(`Cookie import basarisiz. URL=${page.url()}`);
    }

    const browserCookies = await context.cookies(['https://x.com', 'https://twitter.com']);
    const ct0Cookie = browserCookies.find((c) => c.name === 'ct0');
    const twidCookie = browserCookies.find((c) => c.name === 'twid');
    const authMultiCookie = browserCookies.find((c) => c.name === 'auth_multi');

    if (ct0Cookie || twidCookie || authMultiCookie) {
      const patch: Partial<Pick<accounts.Account, 'ct0' | 'twid' | 'authMulti'>> = {};
      if (ct0Cookie && !account.ct0) patch.ct0 = ct0Cookie.value;
      if (twidCookie && !account.twid) patch.twid = twidCookie.value;
      if (authMultiCookie && !account.authMulti) patch.authMulti = authMultiCookie.value;
      if (Object.keys(patch).length > 0) {
        accounts.update(account.id, patch);
        log.info(`Otomatik yakalanan cookie'ler: ${Object.keys(patch).join(', ')}`);
      }
    }

    const profileDir = accountId ? `user-data/${accountId}` : 'user-data';
    log.ok(`Session kaydedildi: ${profileDir}`);
    log.info(`Kontrol URL: ${page.url()}`);
    accounts.touchLastUsed(account.id);
    return true;
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function bootstrapAllSessions(): Promise<void> {
  const active = accounts.getActive();
  log.info(`${active.length} aktif hesap icin session import basliyor.`);

  for (const account of active) {
    try {
      await importSession(account.id);
      log.ok(`@${account.id} session import basarili.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`@${account.id} session import basarisiz: ${msg}`);
    }
  }
}

if (require.main === module) {
  importSession().catch((e) => {
    log.error(e);
    process.exit(1);
  });
}
