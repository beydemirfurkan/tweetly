import { config } from '../config';
import { getDb } from './db';
import { getDefaultAccountId } from './accounts';

function resolveAccountId(accountId?: string): string | null {
  return accountId ?? getDefaultAccountId();
}

export function has(repoSlug: string, accountId?: string): boolean {
  const db = getDb(config.paths.db);
  const acctId = resolveAccountId(accountId);
  const sql = acctId
    ? `SELECT 1 FROM tweets WHERE LOWER(repo) = LOWER(?) AND status = 'sent' AND (account_id = ? OR account_id IS NULL) LIMIT 1`
    : `SELECT 1 FROM tweets WHERE LOWER(repo) = LOWER(?) AND status = 'sent' LIMIT 1`;
  const params = acctId ? [repoSlug, acctId] : [repoSlug];
  const row = db.prepare(sql).get(...params);
  return row != null;
}

export function add(_repoSlug: string): void {
}

export function countSince(date: Date, accountId?: string): number {
  const db = getDb(config.paths.db);
  const acctId = resolveAccountId(accountId);
  const sql = acctId
    ? `SELECT COUNT(*) as cnt FROM tweets WHERE status = 'sent' AND sent_at >= ? AND (account_id = ? OR account_id IS NULL)`
    : `SELECT COUNT(*) as cnt FROM tweets WHERE status = 'sent' AND sent_at >= ?`;
  const params = acctId ? [date.toISOString(), acctId] : [date.toISOString()];
  const row = db.prepare(sql).get(...params) as { cnt: number };
  return row.cnt;
}

export function total(accountId?: string): number {
  const db = getDb(config.paths.db);
  const acctId = resolveAccountId(accountId);
  const sql = acctId
    ? `SELECT COUNT(*) as cnt FROM tweets WHERE status = 'sent' AND (account_id = ? OR account_id IS NULL)`
    : `SELECT COUNT(*) as cnt FROM tweets WHERE status = 'sent'`;
  const params = acctId ? [acctId] : [];
  const row = db.prepare(sql).get(...params) as { cnt: number };
  return row.cnt;
}

export function allRepos(accountId?: string): string[] {
  const db = getDb(config.paths.db);
  const acctId = resolveAccountId(accountId);
  const sql = acctId
    ? `SELECT DISTINCT repo FROM tweets WHERE status = 'sent' AND (account_id = ? OR account_id IS NULL)`
    : `SELECT DISTINCT repo FROM tweets WHERE status = 'sent'`;
  const params = acctId ? [acctId] : [];
  const rows = db.prepare(sql).all(...params) as Array<{ repo: string }>;
  return rows.map((r) => r.repo);
}
