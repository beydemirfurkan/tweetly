require('dotenv').config();
const { launch } = require('./browser');

const USERNAME = process.env.X_USERNAME;
const PASSWORD = process.env.X_PASSWORD;

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
  if (!USERNAME || !PASSWORD) {
    throw new Error('X_USERNAME ve X_PASSWORD .env içinde tanımlı olmalı');
  }

  const { context, page } = await launch();

  try {
    if (await isAlreadyLoggedIn(page)) {
      console.log('[login] Zaten giriş yapılmış. Çıkıyorum.');
      return true;
    }

    console.log('[login] Giriş akışı başlıyor...');
    await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const usernameInput = page.locator('input[autocomplete="username"]').first();
    await usernameInput.waitFor({ state: 'visible', timeout: 30000 });
    await usernameInput.click();
    await typeHuman(usernameInput, USERNAME);
    await page.waitForTimeout(500 + Math.random() * 800);
    await page.keyboard.press('Enter');

    await page.waitForTimeout(2500);

    // Bazen "Enter your phone or email" challenge'ı çıkar
    const challenge = page.locator('input[data-testid="ocfEnterTextTextInput"]').first();
    if (await challenge.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[login] Ek doğrulama soruluyor — username tekrar yazılıyor');
      await challenge.click();
      await typeHuman(challenge, USERNAME);
      await page.waitForTimeout(400);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);
    }

    const passwordInput = page.locator('input[name="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 30000 });
    await passwordInput.click();
    await typeHuman(passwordInput, PASSWORD);
    await page.waitForTimeout(500 + Math.random() * 800);
    await page.keyboard.press('Enter');

    console.log('[login] Login butonuna basıldı, /home bekleniyor (max 2 dk — gerekirse email kodunu manuel gir)...');
    await page.waitForURL('**/home', { timeout: 120000 });
    console.log('[login] ✅ Giriş başarılı, session user-data/ içine kaydedildi.');
    return true;
  } catch (err) {
    console.error('[login] HATA:', err.message);
    try {
      await page.screenshot({ path: `data/errors/login-${Date.now()}.png`, fullPage: true });
    } catch {}
    throw err;
  } finally {
    await context.close();
  }
}

if (require.main === module) {
  login().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { login };
