import cron from 'node-cron';
import * as collect from './pipeline/collect';
import * as dispatch from './pipeline/dispatch';
import * as queue from './storage/queue';
import { config } from './config';
import { hasSessionImportEnv, importSession } from './core/importSession';
import { make } from './utils/logger';

const log = make('orchestrator');
const EMPTY_QUEUE_REFILL_COOLDOWN_MS = 30 * 60 * 1000;

let collectRunning = false;
let lastEmptyRefillAt = 0;

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

async function runCollect(reason: string): Promise<void> {
  if (collectRunning) {
    log.warn(`collect zaten çalışıyor, atlanıyor. Sebep: ${reason}`);
    return;
  }

  collectRunning = true;
  try {
    log.info(`${reason} collect tetiklendi.`);
    const created = await collect.run();
    if (created.length > 0) {
      lastEmptyRefillAt = 0;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`collect hata: ${msg}`);
  } finally {
    collectRunning = false;
  }
}

async function refillQueueIfEmpty(reason: string): Promise<void> {
  if (queue.hasActiveItems()) {
    return;
  }

  const now = Date.now();
  if (now - lastEmptyRefillAt < EMPTY_QUEUE_REFILL_COOLDOWN_MS) {
    log.info('Havuz boş, refill cooldown aktif.');
    return;
  }

  lastEmptyRefillAt = now;
  await runCollect(reason);
}

export async function start(): Promise<void> {
  log.info('Başlıyor.');
  log.info(
    `Plan: günde ${config.pipeline.tweetsPerDay} tweet, başlangıç ${config.pipeline.dispatchStartHour}:00, aralık ${config.pipeline.dispatchIntervalMin} dk.`
  );

  await bootstrapSession();
  await refillQueueIfEmpty('Startup havuz kontrolü');

  cron.schedule(`0 ${config.pipeline.dispatchStartHour} * * *`, async () => {
    await runCollect('Sabah');
  });

  cron.schedule('*/5 * * * *', async () => {
    try {
      await dispatch.run();
      await refillQueueIfEmpty('Havuz boş');
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
