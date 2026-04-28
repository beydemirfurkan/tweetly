/**
 * Faz 2 smoke test:
 *  1) accounts'a test hesabı ekle
 *  2) bir post action enqueue et
 *  3) NestJS uygulamasını noop executor ile boot et
 *  4) claim worker'ın aksiyonu succeeded'e çekmesini bekle
 *  5) idempotency ve duplicate-insert davranışını doğrula
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ActionEnqueueService } from '../action-engine/action-enqueue.service';
import { DataSource } from 'typeorm';

dotenv.config();

const ACCOUNT_ID = 'smoke-account';
const TEXT = `smoke test tweet ${Date.now()}`;

async function ensureAccount(ds: DataSource): Promise<void> {
  await ds.query(
    `INSERT INTO accounts (id, display_name, auth_token, status, created_at)
     VALUES ($1, 'Smoke', 'fake-token', 'active', now())
     ON CONFLICT (id) DO NOTHING`,
    [ACCOUNT_ID],
  );
}

async function lookupStatus(ds: DataSource, idemKey: string): Promise<string | null> {
  const rows = (await ds.query(
    `SELECT status FROM post_actions WHERE idempotency_key = $1`,
    [idemKey],
  )) as Array<{ status: string }>;
  return rows[0]?.status ?? null;
}

async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  timeoutMs: number,
  pollMs = 500,
): Promise<T> {
  const start = Date.now();
  let last = await fn();
  while (!predicate(last) && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    last = await fn();
  }
  return last;
}

async function main(): Promise<void> {
  process.env.X_EXECUTOR_MODE = 'noop';
  process.env.WORKER_POLL_MS = '500';
  process.env.WORKER_BATCH_SIZE = '5';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  app.enableShutdownHooks();
  const ds = app.get(DataSource);
  const enqueue = app.get(ActionEnqueueService);

  await ensureAccount(ds);

  const result = await enqueue.enqueuePost({
    accountId: ACCOUNT_ID,
    text: TEXT,
    scheduledAt: new Date(Date.now() - 1_000),
  });
  console.log(`enqueued: id=${result.id} key=${result.idempotencyKey}`);

  const dup = await enqueue.enqueuePost({
    accountId: ACCOUNT_ID,
    text: TEXT,
    scheduledAt: new Date(Date.now() - 1_000),
  });
  console.log(`duplicate enqueue (expected null id): id=${dup.id}`);

  if (dup.id !== null) {
    throw new Error('Idempotency check failed: duplicate insert returned an id.');
  }

  const final = await waitFor(
    () => lookupStatus(ds, result.idempotencyKey),
    (s) => s === 'succeeded',
    20_000,
  );

  if (final !== 'succeeded') {
    throw new Error(`Action not succeeded within 20s. last_status=${final}`);
  }

  console.log(`final status: ${final}`);
  console.log('SMOKE OK');

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
