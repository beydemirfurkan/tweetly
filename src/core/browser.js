const path = require('path');
const { chromium } = require('patchright');

const USER_DATA_DIR = path.resolve(__dirname, '..', '..', 'user-data');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function launch() {
  const headless = process.env.HEADLESS === 'true';
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
    channel: 'chrome',
    viewport: null,
    userAgent: USER_AGENT,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

module.exports = { launch, USER_DATA_DIR };
