const path = require('path');
const { launch } = require('./browser');
const { config, assertX } = require('../config');
const { make } = require('../utils/logger');

const log = make('login');

async function isAlreadyLoggedIn(page) {
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  const url = page.url();
  return url.includes('/home') && !url.includes('/login') && !url.includes('/i/flow');
}

async function typeHuman(locator, text) {
  for (const ch of text) {
    await locator.type(ch, { delay: 30 + Math.floor(Math.random() * 60) });
  }
}

async function login() {
  assertX();
  const { username, password } = config.x;

  const { context, page } = await launch();

  try {
    if (await isAlreadyLoggedIn(page)) {
      log.info('Zaten giriş yapılmış. Çıkıyorum.');
      return true;
    }

    log.info('Giriş akışı başlıyor...');
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
      log.info('Ek doğrulama soruluyor — username tekrar yazılıyor');
      await challenge.click();
      await typeHuman(challenge, username);
      await page.waitForTimeout(400);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);
    }

    const passwordInput = page.locator('input[name="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 30000 });
    await passwordInput.click();
    await typeHuman(passwordInput, password);
    await page.waitForTimeout(500 + Math.random() * 800);
    await page.keyboard.press('Enter');

    log.info('Login butonuna basıldı, /home bekleniyor (max 2 dk — gerekirse e-posta kodunu manuel gir)...');
    await page.waitForURL('**/home', { timeout: 120000 });
    log.ok('Giriş başarılı, session user-data/ içine kaydedildi.');
    return true;
  } catch (err) {
    log.error(`HATA: ${err.message}`);
    try {
      await page.screenshot({
        path: path.join(config.paths.errors, `login-${Date.now()}.png`),
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

module.exports = { login };
