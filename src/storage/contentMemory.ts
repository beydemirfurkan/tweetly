import crypto from 'crypto';
import { config } from '../config';
import { getDb } from './db';
import { getDefaultAccountId } from './accounts';

const SIMILARITY_THRESHOLD = 0.72;
const MAX_RECENT = 150;

function resolveAccountId(accountId?: string): string | null {
  return accountId ?? getDefaultAccountId();
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/repo:|github:|kaynak:/g, '')
    .replace(/[^a-z0-9ğüşöçıİ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function signature(text: string): string {
  return normalize(text).split(' ').slice(0, 14).join(' ');
}

function tokens(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(' ')
      .filter((word) => word.length > 3)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

export function similarityReason(text: string, accountId?: string): string | null {
  const db = getDb(config.paths.db);
  const acctId = resolveAccountId(accountId);
  const textHash = hash(normalize(text));
  const sig = signature(text);
  const textTokens = tokens(text);

  let sql = `SELECT repo, text_hash, text FROM content_memory ORDER BY id DESC LIMIT ?`;
  const params: unknown[] = [MAX_RECENT];

  if (acctId) {
    sql = `SELECT repo, text_hash, text FROM content_memory WHERE account_id = ? OR account_id IS NULL ORDER BY id DESC LIMIT ?`;
    params.unshift(acctId);
  }

  const rows = db.prepare(sql).all(...params) as Array<{ repo: string; text_hash: string; text: string }>;

  for (const row of rows) {
    if (row.text_hash === textHash) return `exact hash match: ${row.repo}`;
    if (signature(row.text) === sig) return `same opening signature: ${row.repo}`;
    if (jaccard(textTokens, tokens(row.text)) >= SIMILARITY_THRESHOLD) {
      return `high keyword overlap: ${row.repo}`;
    }
  }

  return null;
}

export function add(repo: string, text: string, accountId?: string): void {
  const db = getDb(config.paths.db);
  const acctId = resolveAccountId(accountId);
  const normalized = normalize(text);
  db.prepare(
    `INSERT INTO content_memory (repo, text_hash, signature, text, created_at, account_id) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(repo, hash(normalized), signature(text), text, new Date().toISOString(), acctId);
}

export function count(accountId?: string): number {
  const db = getDb(config.paths.db);
  const acctId = resolveAccountId(accountId);

  if (acctId) {
    const row = db.prepare(
      'SELECT COUNT(*) as cnt FROM content_memory WHERE account_id = ? OR account_id IS NULL'
    ).get(acctId) as { cnt: number };
    return row.cnt;
  }

  const row = db.prepare('SELECT COUNT(*) as cnt FROM content_memory').get() as { cnt: number };
  return row.cnt;
}
