import fs from 'fs';
import path from 'path';
import { chromium, type BrowserContext, type Page } from 'patchright';
import { config } from '../config';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface LaunchResult {
  context: BrowserContext;
  page: Page;
}

function clearStaleProfileLocks(profileDir: string): void {
  fs.mkdirSync(profileDir, { recursive: true });
  for (const name of ['SingletonCookie', 'SingletonLock', 'SingletonSocket']) {
    try {
      fs.rmSync(path.join(profileDir, name), { force: true, recursive: true });
    } catch {}
  }
}

function resolveProfileDir(accountId?: string): string {
  if (accountId) {
    return path.join(config.paths.root, 'user-data', accountId);
  }
  return config.paths.userData;
}

export async function launch(accountId?: string): Promise<LaunchResult> {
  const profileDir = resolveProfileDir(accountId);
  clearStaleProfileLocks(profileDir);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: config.x.headless,
    channel: 'chrome',
    viewport: null,
    userAgent: USER_AGENT,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}
