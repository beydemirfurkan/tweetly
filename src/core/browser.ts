import path from 'path';
import { chromium, type BrowserContext, type Page } from 'patchright';
import { config } from '../config';

export const USER_DATA_DIR = path.resolve(__dirname, '..', '..', 'user-data');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface LaunchResult {
  context: BrowserContext;
  page: Page;
}

export async function launch(): Promise<LaunchResult> {
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
