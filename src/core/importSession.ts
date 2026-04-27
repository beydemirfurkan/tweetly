import type { BrowserContext } from 'patchright';
import { launch } from './browser';
import { config } from '../config';
import { make } from '../utils/logger';

const log = make('importSession');

type CookieInput = Parameters<BrowserContext['addCookies']>[0][number];

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} env içinde tanımlı olmalı`);
  }
  return value.trim();
}

function optionalEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

export function hasSessionImportEnv(): boolean {
  return Boolean(optionalEnv('X_AUTH_TOKEN'));
}

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

export async function importSession(): Promise<boolean> {
  const authToken = requiredEnv('X_AUTH_TOKEN');
  const authMulti = optionalEnv('X_AUTH_MULTI');
  const csrfToken = optionalEnv('X_CT0');
  const twid = optionalEnv('X_TWID');

  const { context, page } = await launch();
  const domains = ['.x.com', '.twitter.com'];
  const cookies: CookieInput[] = [];

  for (const domain of domains) {
    cookies.push(sessionCookie('auth_token', authToken, domain));
    if (authMulti) cookies.push(sessionCookie('auth_multi', authMulti, domain));
    if (csrfToken) cookies.push(visibleCookie('ct0', csrfToken, domain));
    if (twid) cookies.push(visibleCookie('twid', twid, domain));
  }

  try {
    await context.addCookies(cookies);
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    if (page.url().includes('/login') || page.url().includes('/i/flow')) {
      throw new Error(`Cookie import başarısız. URL=${page.url()}`);
    }

    log.ok(`Session kaydedildi: ${config.paths.userData}`);
    log.info(`Kontrol URL: ${page.url()}`);
    return true;
  } finally {
    await context.close().catch(() => undefined);
  }
}

if (require.main === module) {
  importSession().catch((e) => {
    log.error(e);
    process.exit(1);
  });
}
