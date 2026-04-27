import cron from 'node-cron';
import * as collect from './pipeline/collect';
import * as dispatch from './pipeline/dispatch';
import { config } from './config';
import { make } from './utils/logger';

const log = make('orchestrator');

export function start(): void {
  log.info('Başlıyor.');
  log.info(
    `Plan: günde ${config.pipeline.tweetsPerDay} tweet, başlangıç ${config.pipeline.dispatchStartHour}:00, aralık ${config.pipeline.dispatchIntervalMin} dk.`
  );

  cron.schedule(`0 ${config.pipeline.dispatchStartHour} * * *`, async () => {
    log.info('Sabah collect tetiklendi.');
    try {
      await collect.run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`collect hata: ${msg}`);
    }
  });

  cron.schedule('*/5 * * * *', async () => {
    try {
      await dispatch.run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`dispatch hata: ${msg}`);
    }
  });

  log.ok("Cron'lar kuruldu. Süreç ayakta kalıyor.");
}

if (require.main === module) {
  start();
}
