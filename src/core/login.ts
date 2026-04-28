import fs from 'fs';
import path from 'path';
import type { Locator, Page } from 'patchright';
import { launch } from './browser';
import { config } from '../config';
import * as accounts from '../storage/accounts';
import { make } from '../utils/logger';

const log = make('login');

async function isAlreadyLoggedIn(page: Page): Promise<boolean> {
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  const url = page.url();
  return url.includes('/home') && !url.includes('/login') && !url.includes('/i/flow');
}

async function typeHuman(locator: Locator, text: string): Promise<void> {
  for (const ch of text) {
    await locator.type(ch, { delay: 30 + Math.floor(Math.random() * 60) });
  }
}

export async function login(accountId?: string): Promise<boolean> {
  const account = accountId
    ? accounts.getById(accountId)
    : accounts.list()[0];

  if (!account) {
    throw new Error('Hesap bulunamadi');
  }

  if (!config.x.password) {
    throw new Error('X_PASSWORD .env icinde tanimli olmali');
  }

  const username = account.id;
  log.info(`Login: @${username}`);

  const { context, page } = await launch(account.id);

  try {
    if (await isAlreadyLoggedIn(page)) {
      log.info(`@${username} zaten giris yapilmis.`);
      return true;
    }

    log.info('Giris akisi basliyor...');
    await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const usernameInput = page.locator('input[autocomplete="username"]').first();
    await usernameInput.waitFor({ state: 'visible', timeout: 30000 });
    await usernameInput.click();
    await typeHuman(usernameInput, username);
    await page.waitForTimeout(500 + Math.random() * 800);
    await page.keyboard.press('Enter');

    await page.waitForTimeout(2500);

    const challenge = page.locator('input[data-testid="ocfEnterTextTextInput"]').first();
    if (await challenge.isVisible({ timeout: 3000 }).catch(() => false)) {
      log.info('Ek dogrulama soruluyor — username tekrar yaziliyor');
      await challenge.click();
      await typeHuman(challenge, username);
      await page.waitForTimeout(400);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);
    }

    const passwordInput = page.locator('input[name="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 30000 });
    await passwordInput.click();
    await typeHuman(passwordInput, config.x.password);
    await page.waitForTimeout(500 + Math.random() * 800);
    await page.keyboard.press('Enter');

    log.info('Login butonuna basildi, /home bekleniyor...');
    await page.waitForURL('**/home', { timeout: 120000 });
    log.ok(`@${username} giris basarili.`);
    accounts.touchLastUsed(account.id);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`@${username} HATA: ${msg}`);
    try {
      fs.mkdirSync(config.paths.errors, { recursive: true });
      await page.screenshot({
        path: path.join(config.paths.errors, `login-${username}-${Date.now()}.png`),
        fullPage: true,
      });
    } catch {}
    throw err;
  } finally {
    await context.close();
  }
}

if (require.main === module) {
  login().catch((e) => {
    log.error(e);
    process.exit(1);
  });
}
