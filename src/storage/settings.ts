import { config } from '../config';
import { getDb } from './db';
import { getDefaultAccountId } from './accounts';

type SettingType = 'string' | 'number' | 'boolean' | 'json';

interface SettingRow {
  key: string;
  value: string;
  type: SettingType;
  updated_at: string;
  account_id?: string | null;
}

interface SettingDef {
  key: string;
  defaultValue: unknown;
  type: SettingType;
}

const DEFS: SettingDef[] = [
  { key: 'tweets_per_day', defaultValue: 13, type: 'number' },
  { key: 'dispatch_interval_min', defaultValue: 45, type: 'number' },
  { key: 'dispatch_start_hour', defaultValue: 9, type: 'number' },
  { key: 'max_attempts', defaultValue: 3, type: 'number' },
  { key: 'min_repo_score', defaultValue: 40, type: 'number' },
  { key: 'reply_delay_ms', defaultValue: 10000, type: 'number' },
  { key: 'schedule_jitter_min', defaultValue: 15, type: 'number' },
  { key: 'schedule_jitter_max', defaultValue: 45, type: 'number' },
  {
    key: 'schedule.hour_weights',
    defaultValue: {
      '9': 0.3, '10': 0.4, '11': 0.6,
      '12': 1.0, '13': 1.0, '14': 0.9,
      '15': 0.6, '16': 0.6, '17': 0.7,
      '18': 0.9, '19': 1.4, '20': 1.5, '21': 1.3, '22': 0.8,
    },
    type: 'json',
  },
  { key: 'content_memory_max', defaultValue: 500, type: 'number' },
  { key: 'scoring.relevance.high', defaultValue: 20, type: 'number' },
  { key: 'scoring.relevance.tool', defaultValue: 10, type: 'number' },
  { key: 'scoring.popularity.high', defaultValue: 25, type: 'number' },
  { key: 'scoring.popularity.mid', defaultValue: 15, type: 'number' },
  { key: 'scoring.popularity.low', defaultValue: 5, type: 'number' },
  { key: 'scoring.trust.high_stars', defaultValue: 15, type: 'number' },
  { key: 'scoring.trust.mid_stars', defaultValue: 10, type: 'number' },
  { key: 'scoring.trust.verified_owner', defaultValue: 5, type: 'number' },
  { key: 'scoring.clarity.good', defaultValue: 10, type: 'number' },
  { key: 'scoring.clarity.no_desc', defaultValue: -20, type: 'number' },
  { key: 'scoring.clarity.generic', defaultValue: -10, type: 'number' },
  { key: 'scoring.freshness.high', defaultValue: 10, type: 'number' },
  { key: 'scoring.freshness.mid', defaultValue: 5, type: 'number' },
  { key: 'scoring.novelty.topic_repeat', defaultValue: -10, type: 'number' },
  { key: 'scoring.novelty.owner_repeat', defaultValue: -5, type: 'number' },
  { key: 'format.no_link_hook.weight', defaultValue: 3, type: 'number' },
  { key: 'format.repo_drop.weight', defaultValue: 2, type: 'number' },
  { key: 'format.question.weight', defaultValue: 2, type: 'number' },
  { key: 'format.comparison.weight', defaultValue: 1, type: 'number' },
  { key: 'format.bookmark_bait.weight', defaultValue: 1, type: 'number' },
  { key: 'format.hot_take.weight', defaultValue: 1, type: 'number' },
  { key: 'format.mini_thread.weight', defaultValue: 1, type: 'number' },
  { key: 'format.weekly_digest.weight', defaultValue: 1, type: 'number' },
  { key: 'format.repo_drop.link_as_reply', defaultValue: true, type: 'boolean' },
  { key: 'format.adaptive.enabled', defaultValue: true, type: 'boolean' },
  { key: 'format.adaptive.min_samples', defaultValue: 5, type: 'number' },
  { key: 'format.adaptive.boost_factor', defaultValue: 1.5, type: 'number' },
  { key: 'format.adaptive.cut_factor', defaultValue: 0.5, type: 'number' },
  { key: 'digest.day', defaultValue: 5, type: 'number' },
  { key: 'thread.days', defaultValue: '1,3,5', type: 'string' },
];

const cache = new Map<string, { value: unknown; cachedAt: number }>();
const CACHE_TTL_MS = 60_000;
let defaultsEnsured = false;

function getSettingDef(key: string): SettingDef | undefined {
  return DEFS.find((d) => d.key === key);
}

function ensureDefaults(): void {
  if (defaultsEnsured) return;

  const db = getDb(config.paths.db);
  const existing = new Set(
    (db.prepare('SELECT key FROM settings').all() as Array<{ key: string }>).map((r) => r.key)
  );

  const insert = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value, type, updated_at) VALUES (?, ?, ?, ?)"
  );

  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    for (const def of DEFS) {
      if (!existing.has(def.key)) {
        const val = def.type === 'json' ? JSON.stringify(def.defaultValue) : String(def.defaultValue);
        insert.run(def.key, val, def.type, now);
      }
    }
  });
  txn();
  defaultsEnsured = true;
}

function parseValue(raw: string, type: SettingType): unknown {
  switch (type) {
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
    case 'boolean':
      return raw === 'true' || raw === '1';
    case 'json':
      try { return JSON.parse(raw); } catch { return null; }
    default:
      return raw;
  }
}

function settingsKey(key: string, accountId?: string): string {
  return accountId ? `${accountId}:${key}` : key;
}

export function get<T = unknown>(key: string, fallback?: T, accountId?: string): T {
  const cacheKey = settingsKey(key, accountId);
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.value as T;
  }

  const db = getDb(config.paths.db);
  ensureDefaults();

  let row: SettingRow | undefined;

  if (accountId) {
    row = db.prepare(
      'SELECT value, type, updated_at FROM settings WHERE key = ? AND account_id = ?'
    ).get(key, accountId) as SettingRow | undefined;
  }

  if (!row) {
    row = db.prepare(
      'SELECT value, type, updated_at FROM settings WHERE key = ? AND account_id IS NULL'
    ).get(key) as SettingRow | undefined;
  }

  if (!row) {
    const def = getSettingDef(key);
    const value = def ? def.defaultValue : fallback;
    return value as T;
  }

  const value = parseValue(row.value, row.type);
  cache.set(cacheKey, { value, cachedAt: now });
  return value as T;
}

export function set(key: string, value: unknown, accountId?: string): void {
  const db = getDb(config.paths.db);
  ensureDefaults();

  const def = getSettingDef(key);
  const type = def?.type ?? 'string';
  const raw = type === 'json' ? JSON.stringify(value) : String(value);
  const now = new Date().toISOString();

  if (accountId) {
    db.prepare(
      `INSERT INTO settings (key, value, type, updated_at, account_id) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key, account_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, raw, type, now, accountId);
  } else {
    db.prepare(
      `INSERT INTO settings (key, value, type, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key, account_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, raw, type, now);
  }

  const cacheKey = settingsKey(key, accountId);
  cache.set(cacheKey, { value, cachedAt: Date.now() });
}

export function getAll(accountId?: string): Record<string, { value: unknown; type: SettingType }> {
  const db = getDb(config.paths.db);
  ensureDefaults();

  let rows: SettingRow[];
  if (accountId) {
    rows = db.prepare(
      'SELECT key, value, type FROM settings WHERE account_id = ? OR account_id IS NULL'
    ).all(accountId) as SettingRow[];
  } else {
    rows = db.prepare('SELECT key, value, type FROM settings WHERE account_id IS NULL').all() as SettingRow[];
  }

  const result: Record<string, { value: unknown; type: SettingType }> = {};
  for (const row of rows) {
    if (!result[row.key] || row.account_id != null) {
      result[row.key] = { value: parseValue(row.value, row.type), type: row.type };
    }
  }
  return result;
}

export function getScoringWeights(): Record<string, number> {
  return {
    relevanceHigh: get<number>('scoring.relevance.high'),
    relevanceTool: get<number>('scoring.relevance.tool'),
    popularityHigh: get<number>('scoring.popularity.high'),
    popularityMid: get<number>('scoring.popularity.mid'),
    popularityLow: get<number>('scoring.popularity.low'),
    trustHighStars: get<number>('scoring.trust.high_stars'),
    trustMidStars: get<number>('scoring.trust.mid_stars'),
    trustVerifiedOwner: get<number>('scoring.trust.verified_owner'),
    clarityGood: get<number>('scoring.clarity.good'),
    clarityNoDesc: get<number>('scoring.clarity.no_desc'),
    clarityGeneric: get<number>('scoring.clarity.generic'),
    freshnessHigh: get<number>('scoring.freshness.high'),
    freshnessMid: get<number>('scoring.freshness.mid'),
    noveltyTopicRepeat: get<number>('scoring.novelty.topic_repeat'),
    noveltyOwnerRepeat: get<number>('scoring.novelty.owner_repeat'),
  };
}

export function getFormatWeights(): Record<string, number> {
  return {
    no_link_hook: get<number>('format.no_link_hook.weight'),
    repo_drop: get<number>('format.repo_drop.weight'),
    question: get<number>('format.question.weight'),
    comparison: get<number>('format.comparison.weight'),
    bookmark_bait: get<number>('format.bookmark_bait.weight'),
    hot_take: get<number>('format.hot_take.weight'),
    mini_thread: get<number>('format.mini_thread.weight'),
    weekly_digest: get<number>('format.weekly_digest.weight'),
  };
}

export function getThreadDays(): number[] {
  const raw = get<string>('thread.days', '1,3,5');
  return raw.split(',').map(Number).filter((n) => Number.isFinite(n));
}

export function isKnownSetting(key: string): boolean {
  return Boolean(getSettingDef(key));
}
