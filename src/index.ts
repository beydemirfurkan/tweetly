import cron from 'node-cron';
import * as collect from './pipeline/collect';
import * as dispatch from './pipeline/dispatch';
import { config } from './config';
import { hasSessionImportEnv, importSession } from './core/importSession';
import { make } from './utils/logger';

const log = make('orchestrator');

async function bootstrapSession(): Promise<void> {
  if (!hasSessionImportEnv()) {
    return;
  }

  log.info('X session env bulundu. Browser profiline import ediliyor.');
  try {
    await importSession();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`session import hata: ${msg}`);
  }
}

export async function start(): Promise<void> {
  log.info('Başlıyor.');
  log.info(
    `Plan: günde ${config.pipeline.tweetsPerDay} tweet, başlangıç ${config.pipeline.dispatchStartHour}:00, aralık ${config.pipeline.dispatchIntervalMin} dk.`
  );

  await bootstrapSession();

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
  start().catch((err) => {
    log.error(err);
    process.exit(1);
  });
}
