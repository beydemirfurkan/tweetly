import cron from 'node-cron';
import * as collect from './pipeline/collect';
import * as dispatch from './pipeline/dispatch';
import * as queue from './storage/queue';
import * as accounts from './storage/accounts';
import { config } from './config';
import { hasSessionImportEnv, importSession, bootstrapAllSessions } from './core/importSession';
import { startHealthServer, setTriggers } from './ops/healthServer';
import * as runtime from './ops/runtime';
import { make } from './utils/logger';

const log = make('orchestrator');
const EMPTY_QUEUE_REFILL_COOLDOWN_MS = 30 * 60 * 1000;

let collectRunning = false;
let lastEmptyRefillAt = 0;

async function bootstrapSessions(): Promise<void> {
  accounts.bootstrapFromEnv();

  const active = accounts.getActive();
  if (active.length === 0) {
    log.warn('Aktif hesap yok. Tek hesapli modda devam ediliyor.');
    if (hasSessionImportEnv()) {
      await importSingleSession();
    }
    return;
  }

  log.info(`${active.length} hesap bulundu: ${active.map((a) => `@${a.id}`).join(', ')}`);

  for (const account of active) {
    try {
      await importSession(account.id);
      runtime.markSessionImport({ ok: true, message: `@${account.id} imported` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      runtime.markSessionImport({ ok: false, message: `@${account.id}: ${msg}` });
      log.error(`@${account.id} session import hata: ${msg}`);
    }
  }
}

async function importSingleSession(): Promise<void> {
  try {
    await importSession();
    runtime.markSessionImport({ ok: true, message: 'imported' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.markSessionImport({ ok: false, message: msg });
    log.error(`session import hata: ${msg}`);
  }
}

async function runCollect(reason: string, accountId?: string): Promise<void> {
  if (collectRunning) {
    log.warn(`collect zaten çalışıyor, atlanıyor. Sebep: ${reason}`);
    return;
  }

  collectRunning = true;
  runtime.setCollectRunning(true);
  try {
    log.info(`${reason} collect tetiklendi${accountId ? ` (@${accountId})` : ''}.`);
    const created = await collect.run(accountId);
    runtime.markCollect({ ok: true, reason, created: created.length });
    if (created.length > 0) {
      lastEmptyRefillAt = 0;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.markCollect({ ok: false, reason, created: 0, message: msg });
    log.error(`collect hata: ${msg}`);
  } finally {
    collectRunning = false;
    runtime.setCollectRunning(false);
  }
}

async function runCollectForAllAccounts(reason: string): Promise<void> {
  const active = accounts.getActive();

  if (active.length <= 1) {
    await runCollect(reason, active[0]?.id);
    return;
  }

  for (const account of active) {
    await runCollect(`${reason} (@${account.id})`, account.id);
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
  runtime.markEmptyRefillAttempt();
  await runCollectForAllAccounts(reason);
}

export async function start(): Promise<void> {
  startHealthServer();
  setTriggers({
    collect: () => runCollectForAllAccounts('Manual trigger'),
    dispatch: async () => { await dispatch.run(); },
  });

  log.info('Başlıyor.');
  log.info(
    `Plan: günde ${config.pipeline.tweetsPerDay} tweet, başlangıç ${config.pipeline.dispatchStartHour}:00, aralık ${config.pipeline.dispatchIntervalMin} dk.`
  );

  await bootstrapSessions();
  await refillQueueIfEmpty('Startup havuz kontrolü');

  cron.schedule(`0 ${config.pipeline.dispatchStartHour} * * *`, async () => {
    await runCollectForAllAccounts('Sabah');
  });

  cron.schedule('*/5 * * * *', async () => {
    try {
      const item = await dispatch.run();
      runtime.markDispatch({ ok: true, repo: item?.repo ?? null });
      await refillQueueIfEmpty('Havuz boş');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      runtime.markDispatch({ ok: false, repo: null, message: msg });
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
