import crypto from 'crypto';
import { config } from '../config';
import { getDb } from './db';
import { get } from './settings';
import { getDefaultAccountId } from './accounts';
import type { QueueItem, QueueStatus, ContentFormat, EngagementObjective, Topic } from '../types';

function newId(): string {
  return crypto.randomBytes(6).toString('hex');
}

function maxAttempts(): number {
  return get<number>('max_attempts', 3);
}

function resolveAccountId(accountId?: string): string | null {
  return accountId ?? getDefaultAccountId();
}

function rowToItem(row: Record<string, unknown>): QueueItem {
  return {
    id: row.id as string,
    status: row.status as QueueStatus,
    attempts: row.attempts as number,
    createdAt: row.created_at as string,
    scheduledAt: row.scheduled_at as string,
    repo: row.repo as string,
    url: row.url as string,
    text: row.text as string,
    format: (row.format as ContentFormat) || undefined,
    objective: (row.objective as EngagementObjective) || undefined,
    topic: (row.topic as Topic) || undefined,
    source: (row.source as string) || undefined,
    score: row.score != null ? (row.score as number) : undefined,
    parentId: (row.parent_id as string) || undefined,
    threadGroupId: (row.thread_group_id as string) || undefined,
    tweetId: (row.tweet_id as string) || undefined,
    tweetUrl: (row.tweet_url as string) || undefined,
    sentAt: (row.sent_at as string) || undefined,
    lastError: (row.last_error as string) || undefined,
    lastTriedAt: (row.last_tried_at as string) || undefined,
    campaignId: (row.campaign_id as string) || undefined,
    accountId: (row.account_id as string) || undefined,
    mediaPath: (row.media_path as string) || undefined,
  };
}

export type EnqueueInput = Pick<QueueItem, 'repo' | 'url' | 'text' | 'scheduledAt'> & {
  format?: QueueItem['format'];
  objective?: QueueItem['objective'];
  topic?: QueueItem['topic'];
  source?: QueueItem['source'];
  score?: QueueItem['score'];
  parentId?: QueueItem['parentId'];
  threadGroupId?: QueueItem['threadGroupId'];
  campaignId?: QueueItem['campaignId'];
  mediaPath?: QueueItem['mediaPath'];
};

const INSERT_SQL = `
  INSERT INTO tweets (id, status, attempts, created_at, scheduled_at, repo, url, text,
    format, objective, topic, source, score, parent_id, thread_group_id, campaign_id, account_id, media_path)
  VALUES (?, 'pending', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export function enqueue(items: EnqueueInput[], accountId?: string): QueueItem[] {
  const db = getDb(config.paths.db);
  const now = new Date().toISOString();
  const acctId = resolveAccountId(accountId);
  const insert = db.prepare(INSERT_SQL);
  const enriched: QueueItem[] = items.map((it) => ({
    id: newId(),
    status: 'pending' as QueueStatus,
    attempts: 0,
    createdAt: now,
    ...it,
  }));

  const txn = db.transaction(() => {
    for (const item of enriched) {
      insert.run(
        item.id,
        item.createdAt,
        item.scheduledAt,
        item.repo,
        item.url,
        item.text,
        item.format ?? null,
        item.objective ?? null,
        item.topic ?? null,
        item.source ?? null,
        item.score ?? null,
        item.parentId ?? null,
        item.threadGroupId ?? null,
        item.campaignId ?? null,
        acctId,
        item.mediaPath ?? null
      );
    }
  });
  txn();
  return enriched;
}

export function dueNext(accountId?: string, now: Date = new Date()): QueueItem | null {
  const db = getDb(config.paths.db);
  const acctId = resolveAccountId(accountId);

  let sql = `
    SELECT * FROM tweets
    WHERE (status = 'pending' OR (status = 'failed' AND attempts < ?))
      AND scheduled_at <= ?
      AND (
        parent_id IS NULL
        OR EXISTS (SELECT 1 FROM tweets p WHERE p.id = tweets.parent_id AND p.status = 'sent')
      )`;

  const params: unknown[] = [maxAttempts(), now.toISOString()];

  if (acctId) {
    sql += ` AND (account_id = ? OR account_id IS NULL)`;
    params.push(acctId);
  }

  sql += ` ORDER BY scheduled_at ASC LIMIT 1`;

  const row = db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
  return row ? rowToItem(row) : null;
}

export function hasActiveItems(accountId?: string): boolean {
  const db = getDb(config.paths.db);
  const acctId = resolveAccountId(accountId);

  let sql = `
    SELECT 1 FROM tweets
    WHERE status = 'pending' OR (status = 'failed' AND attempts < ?)`;
  const params: unknown[] = [maxAttempts()];

  if (acctId) {
    sql += ` AND (account_id = ? OR account_id IS NULL)`;
    params.push(acctId);
  }

  sql += ` LIMIT 1`;
  const row = db.prepare(sql).get(...params);
  return row != null;
}

export interface QueueSummary {
  total: number;
  active: number;
  counts: Record<QueueStatus, number>;
  nextScheduledAt: string | null;
  nextDueAt: string | null;
  latestSentAt: string | null;
  latestErrorAt: string | null;
}

export function summary(accountId?: string, now: Date = new Date()): QueueSummary {
  const db = getDb(config.paths.db);
  const acctId = resolveAccountId(accountId);
  const nowIso = now.toISOString();
  const ma = maxAttempts();

  const acctFilter = acctId ? ` AND (account_id = ? OR account_id IS NULL)` : '';
  const acctParams = acctId ? [acctId] : [];

  const countsRow = db.prepare(
    `SELECT status, COUNT(*) as cnt FROM tweets WHERE 1=1 ${acctFilter} GROUP BY status`
  ).all(...acctParams) as Array<{ status: string; cnt: number }>;

  const counts: Record<QueueStatus, number> = { pending: 0, sent: 0, failed: 0, dead: 0 };
  let total = 0;
  for (const row of countsRow) {
    counts[row.status as QueueStatus] = row.cnt;
    total += row.cnt;
  }

  const activeRow = db.prepare(
    `SELECT COUNT(*) as cnt FROM tweets WHERE (status = 'pending' OR (status = 'failed' AND attempts < ?)) ${acctFilter}`
  ).get(ma, ...acctParams) as { cnt: number };

  const nextScheduledRow = db.prepare(
    `SELECT scheduled_at FROM tweets WHERE (status = 'pending' OR (status = 'failed' AND attempts < ?)) ${acctFilter} ORDER BY scheduled_at ASC LIMIT 1`
  ).get(ma, ...acctParams) as { scheduled_at: string } | undefined;

  const nextDueRow = db.prepare(
    `SELECT scheduled_at FROM tweets WHERE (status = 'pending' OR (status = 'failed' AND attempts < ?)) AND scheduled_at <= ? ${acctFilter} ORDER BY scheduled_at ASC LIMIT 1`
  ).get(ma, nowIso, ...acctParams) as { scheduled_at: string } | undefined;

  const latestSentRow = db.prepare(
    `SELECT sent_at FROM tweets WHERE sent_at IS NOT NULL ${acctFilter} ORDER BY sent_at DESC LIMIT 1`
  ).get(...acctParams) as { sent_at: string } | undefined;

  const latestErrorRow = db.prepare(
    `SELECT last_tried_at FROM tweets WHERE last_tried_at IS NOT NULL ${acctFilter} ORDER BY last_tried_at DESC LIMIT 1`
  ).get(...acctParams) as { last_tried_at: string } | undefined;

  return {
    total,
    active: activeRow.cnt,
    counts,
    nextScheduledAt: nextScheduledRow?.scheduled_at ?? null,
    nextDueAt: nextDueRow?.scheduled_at ?? null,
    latestSentAt: latestSentRow?.sent_at ?? null,
    latestErrorAt: latestErrorRow?.last_tried_at ?? null,
  };
}

export function update(id: string, patch: Partial<QueueItem>): QueueItem | null {
  const db = getDb(config.paths.db);

  const sets: string[] = [];
  const values: unknown[] = [];

  const columnMap: Record<string, string> = {
    status: 'status',
    attempts: 'attempts',
    scheduledAt: 'scheduled_at',
    format: 'format',
    objective: 'objective',
    topic: 'topic',
    source: 'source',
    score: 'score',
    parentId: 'parent_id',
    threadGroupId: 'thread_group_id',
    tweetId: 'tweet_id',
    tweetUrl: 'tweet_url',
    sentAt: 'sent_at',
    lastError: 'last_error',
    lastTriedAt: 'last_tried_at',
    campaignId: 'campaign_id',
    mediaPath: 'media_path',
  };

  for (const [key, col] of Object.entries(columnMap)) {
    if (key in patch) {
      sets.push(`${col} = ?`);
      values.push((patch as Record<string, unknown>)[key] ?? null);
    }
  }

  if (sets.length === 0) {
    const existing = db.prepare('SELECT * FROM tweets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return existing ? rowToItem(existing) : null;
  }

  values.push(id);
  db.prepare(`UPDATE tweets SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  const row = db.prepare('SELECT * FROM tweets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToItem(row) : null;
}

export function pendingRepoSlugs(accountId?: string): string[] {
  const db = getDb(config.paths.db);
  const acctId = resolveAccountId(accountId);

  let sql = `SELECT LOWER(repo) as repo FROM tweets WHERE status IN ('pending', 'failed')`;
  const params: unknown[] = [];

  if (acctId) {
    sql += ` AND (account_id = ? OR account_id IS NULL)`;
    params.push(acctId);
  }

  const rows = db.prepare(sql).all(...params) as Array<{ repo: string }>;
  return rows.map((r) => r.repo);
}

export function getPendingReplies(parentId: string): QueueItem[] {
  const db = getDb(config.paths.db);
  const rows = db
    .prepare(`SELECT * FROM tweets WHERE parent_id = ? AND status = 'pending' ORDER BY scheduled_at ASC`)
    .all(parentId) as Record<string, unknown>[];
  return rows.map(rowToItem);
}
