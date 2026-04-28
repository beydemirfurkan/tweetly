import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { getDb } from '../storage/db';

const log = (...args: unknown[]) => console.log('[migrate]', ...args);

function migrateQueue(db: ReturnType<typeof getDb>): void {
  const queuePath = config.paths.queue;
  if (!fs.existsSync(queuePath)) {
    log('queue.json bulunamadi, atlanıyor.');
    return;
  }

  const raw = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  const items = raw?.items ?? [];
  if (items.length === 0) {
    log('queue.json bos, atlanıyor.');
    return;
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO tweets
      (id, status, attempts, created_at, scheduled_at, repo, url, text,
       sent_at, last_error, last_tried_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let migrated = 0;
  const txn = db.transaction(() => {
    for (const item of items) {
      insert.run(
        item.id,
        item.status ?? 'pending',
        item.attempts ?? 0,
        item.createdAt ?? new Date().toISOString(),
        item.scheduledAt ?? new Date().toISOString(),
        item.repo,
        item.url ?? '',
        item.text ?? '',
        item.sentAt ?? null,
        item.lastError ?? null,
        item.lastTriedAt ?? null
      );
      migrated++;
    }
  });
  txn();
  log(`queue.json: ${migrated} item migrate edildi.`);
}

function migratePosted(db: ReturnType<typeof getDb>): void {
  const postedPath = config.paths.posted;
  if (!fs.existsSync(postedPath)) {
    log('posted.json bulunamadi, atlanıyor.');
    return;
  }

  const raw = JSON.parse(fs.readFileSync(postedPath, 'utf8'));
  const items = raw?.items ?? [];
  if (items.length === 0) {
    log('posted.json bos, atlanıyor.');
    return;
  }

  let migrated = 0;
  const txn = db.transaction(() => {
    for (const item of items) {
      const existing = db
        .prepare(`SELECT 1 FROM tweets WHERE LOWER(repo) = LOWER(?) AND status = 'sent' LIMIT 1`)
        .get(item.repo);

      if (!existing) {
        const id = `legacy-${migrated}`;
        db.prepare(`
          INSERT OR IGNORE INTO tweets
            (id, status, attempts, created_at, scheduled_at, repo, url, text, sent_at)
          VALUES (?, 'sent', 0, ?, ?, ?, '', '', ?)
        `).run(id, item.postedAt, item.postedAt, item.repo, item.postedAt);
        migrated++;
      }
    }
  });
  txn();
  log(`posted.json: ${migrated} item migrate edildi.`);
}

function migrateControl(db: ReturnType<typeof getDb>): void {
  const controlPath = config.paths.control;
  if (!fs.existsSync(controlPath)) {
    log('control.json bulunamadi, atlanıyor.');
    return;
  }

  const raw = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
  if (!raw || typeof raw !== 'object') {
    log('control.json gecersiz, atlanıyor.');
    return;
  }

  const upsert = db.prepare(
    `INSERT INTO control_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );

  const entries: Array<[string, string]> = [
    ['paused', String(raw.paused ?? false)],
    ['consecutiveFailures', String(raw.consecutiveFailures ?? 0)],
    ['updatedAt', raw.updatedAt ?? new Date().toISOString()],
  ];
  if (raw.reason) entries.push(['reason', raw.reason]);
  if (raw.pausedAt) entries.push(['pausedAt', raw.pausedAt]);
  if (raw.pauseUntil) entries.push(['pauseUntil', raw.pauseUntil]);
  if (raw.lastFailureAt) entries.push(['lastFailureAt', raw.lastFailureAt]);
  if (raw.lastFailure) entries.push(['lastFailure', raw.lastFailure]);
  if (raw.lastSuccessAt) entries.push(['lastSuccessAt', raw.lastSuccessAt]);

  db.transaction(() => {
    for (const [key, value] of entries) {
      upsert.run(key, value);
    }
  })();
  log(`control.json: ${entries.length} key migrate edildi.`);
}

function migrateContentMemory(db: ReturnType<typeof getDb>): void {
  const cmPath = config.paths.contentMemory;
  if (!fs.existsSync(cmPath)) {
    log('content-memory.json bulunamadi, atlanıyor.');
    return;
  }

  const raw = JSON.parse(fs.readFileSync(cmPath, 'utf8'));
  const items = raw?.items ?? [];
  if (items.length === 0) {
    log('content-memory.json bos, atlanıyor.');
    return;
  }

  const insert = db.prepare(`
    INSERT INTO content_memory (repo, text_hash, signature, text, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  let migrated = 0;
  db.transaction(() => {
    for (const item of items) {
      insert.run(item.repo, item.textHash, item.signature, item.text, item.createdAt);
      migrated++;
    }
  })();
  log(`content-memory.json: ${migrated} item migrate edildi.`);
}

function main(): void {
  log('Basliyor...');
  log(`DB yolu: ${config.paths.db}`);

  const db = getDb(config.paths.db);

  migrateQueue(db);
  migratePosted(db);
  migrateControl(db);
  migrateContentMemory(db);

  log('Tamamlandi.');
}

main();
