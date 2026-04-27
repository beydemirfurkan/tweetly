import fs from 'fs';
import path from 'path';
import { chromium, type BrowserContext, type Page } from 'patchright';
import { config } from '../config';

export const USER_DATA_DIR = config.paths.userData;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface LaunchResult {
  context: BrowserContext;
  page: Page;
}

function clearStaleProfileLocks(): void {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  for (const name of ['SingletonCookie', 'SingletonLock', 'SingletonSocket']) {
    try {
      fs.rmSync(path.join(USER_DATA_DIR, name), { force: true, recursive: true });
    } catch {}
  }
}

export async function launch(): Promise<LaunchResult> {
  clearStaleProfileLocks();
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
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
