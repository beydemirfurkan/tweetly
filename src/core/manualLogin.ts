import { launch } from './browser';
import { config } from '../config';
import { make } from '../utils/logger';

const log = make('manualLogin');

export async function manualLogin(): Promise<boolean> {
  const { context, page } = await launch();

  try {
    await page.goto('https://x.com/i/flow/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    log.info('Tarayıcı açıldı. X login adımlarını tamamen manuel tamamla.');
    log.info('Login başarılı olunca /home bekleniyor. Bu pencereyi kapatma.');

    await page.waitForURL('**/home', { timeout: 10 * 60 * 1000 });
    log.ok(`Session kaydedildi: ${config.paths.userData}`);
    return true;
  } finally {
    await context.close();
  }
}

if (require.main === module) {
  manualLogin().catch((e) => {
    log.error(e);
    process.exit(1);
  });
}
