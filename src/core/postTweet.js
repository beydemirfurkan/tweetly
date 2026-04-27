const path = require('path');
const { launch } = require('./browser');
const { config } = require('../config');
const { make } = require('../utils/logger');

const log = make('postTweet');

async function typeHuman(locator, text) {
  for (const ch of text) {
    await locator.type(ch, { delay: 30 + Math.floor(Math.random() * 60) });
  }
}

async function postTweet(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('postTweet: boş metin');
  }
  if (text.length > 280) {
    throw new Error(`postTweet: metin 280 karakteri aşıyor (${text.length})`);
  }

  const { context, page } = await launch();

  try {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    if (page.url().includes('/login') || page.url().includes('/i/flow')) {
      throw new Error('Session geçersiz — önce `npm run login` çalıştır.');
    }

    const composer = page.locator('[data-testid="tweetTextarea_0"]').first();
    await composer.waitFor({ state: 'visible', timeout: 20000 });
    await composer.click();
    await page.waitForTimeout(400 + Math.random() * 600);
    await typeHuman(composer, text);
    await page.waitForTimeout(700 + Math.random() * 800);

    const postBtn = page
      .locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]')
      .first();
    await postBtn.waitFor({ state: 'visible', timeout: 10000 });
    const disabled = await postBtn.getAttribute('aria-disabled');
    if (disabled === 'true') {
      throw new Error('Post butonu disabled — metinde sorun olabilir.');
    }
    await postBtn.click();

    try {
      await Promise.race([
        page.waitForSelector('[data-testid="toast"]', { timeout: 15000 }),
        page.waitForFunction(
          () => {
            const el = document.querySelector('[data-testid="tweetTextarea_0"]');
            return el && el.textContent.trim().length === 0;
          },
          { timeout: 15000 }
        ),
      ]);
    } catch {
      throw new Error('Post sonrası onay alınamadı (toast/textarea boşalmadı).');
    }

    log.ok(`Atıldı: "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);
    await page.waitForTimeout(3000);
    return true;
  } catch (err) {
    log.error(`HATA: ${err.message}`);
    try {
      await page.screenshot({
        path: path.join(config.paths.errors, `post-${Date.now()}.png`),
        fullPage: true,
      });
    } catch {}
    throw err;
  } finally {
    await context.close();
  }
}

if (require.main === module) {
  const text = process.argv.slice(2).join(' ');
  if (!text) {
    log.error('Kullanım: node src/core/postTweet.js "tweet metni"');
    process.exit(1);
  }
  postTweet(text).catch(() => process.exit(1));
}

module.exports = postTweet;
