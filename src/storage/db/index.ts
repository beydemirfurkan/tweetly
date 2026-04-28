import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS tweets (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        scheduled_at TEXT NOT NULL,
        repo TEXT NOT NULL,
        url TEXT NOT NULL,
        text TEXT NOT NULL,
        format TEXT,
        objective TEXT,
        topic TEXT,
        source TEXT,
        score REAL,
        parent_id TEXT,
        thread_group_id TEXT,
        tweet_id TEXT,
        tweet_url TEXT,
        sent_at TEXT,
        last_error TEXT,
        last_tried_at TEXT,
        campaign_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tweets_status ON tweets(status);
      CREATE INDEX IF NOT EXISTS idx_tweets_scheduled_at ON tweets(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_tweets_repo ON tweets(repo);
      CREATE INDEX IF NOT EXISTS idx_tweets_parent_id ON tweets(parent_id);
      CREATE INDEX IF NOT EXISTS idx_tweets_thread_group_id ON tweets(thread_group_id);
      CREATE INDEX IF NOT EXISTS idx_tweets_format ON tweets(format);
      CREATE INDEX IF NOT EXISTS idx_tweets_topic ON tweets(topic);
      CREATE INDEX IF NOT EXISTS idx_tweets_sent_at ON tweets(sent_at);

      CREATE TABLE IF NOT EXISTS content_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo TEXT NOT NULL,
        text_hash TEXT NOT NULL,
        signature TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_content_memory_text_hash ON content_memory(text_hash);
      CREATE INDEX IF NOT EXISTS idx_content_memory_created_at ON content_memory(created_at);

      CREATE TABLE IF NOT EXISTS control_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );

      INSERT INTO schema_version (version) VALUES (1);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS analytics_events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        format TEXT,
        objective TEXT,
        repo TEXT NOT NULL,
        topic TEXT,
        source TEXT,
        tweet_id TEXT,
        tweet_url TEXT,
        duration_ms INTEGER,
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(type);
      CREATE INDEX IF NOT EXISTS idx_analytics_format ON analytics_events(format);
      CREATE INDEX IF NOT EXISTS idx_analytics_repo ON analytics_events(repo);

      INSERT INTO schema_version (version) VALUES (2);
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'string',
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

      INSERT INTO schema_version (version) VALUES (3);
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        display_name TEXT,
        auth_token TEXT NOT NULL,
        auth_multi TEXT,
        ct0 TEXT,
        twid TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        last_used_at TEXT
      );

      INSERT INTO schema_version (version) VALUES (4);
    `,
  },
  {
    version: 5,
    sql: `
      ALTER TABLE tweets ADD COLUMN account_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_tweets_account_id ON tweets(account_id);

      ALTER TABLE content_memory ADD COLUMN account_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_content_memory_account_id ON content_memory(account_id);

      ALTER TABLE analytics_events ADD COLUMN account_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_analytics_account_id ON analytics_events(account_id);

      ALTER TABLE settings ADD COLUMN account_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_settings_account_id ON settings(account_id);

      INSERT INTO schema_version (version) VALUES (5);
    `,
  },
  {
    version: 6,
    sql: `
      CREATE TABLE IF NOT EXISTS settings_v2 (
        key TEXT NOT NULL,
        account_id TEXT,
        value TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'string',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (key, account_id)
      );

      INSERT OR IGNORE INTO settings_v2 (key, account_id, value, type, updated_at)
        SELECT key, NULL, value, type, updated_at FROM settings;

      DROP TABLE IF EXISTS settings;
      ALTER TABLE settings_v2 RENAME TO settings;

      CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
      CREATE INDEX IF NOT EXISTS idx_settings_account_id ON settings(account_id);

      INSERT INTO schema_version (version) VALUES (6);
    `,
  },
  {
    version: 7,
    sql: `
      ALTER TABLE tweets ADD COLUMN media_path TEXT;

      INSERT INTO schema_version (version) VALUES (7);
    `,
  },
  {
    version: 8,
    sql: `
      -- Refresh prior defaults to new X-algorithm-aligned values.
      -- Only updates rows still matching the old default; manual overrides untouched.
      UPDATE settings SET value='13' WHERE key='tweets_per_day' AND value='8' AND account_id IS NULL;
      UPDATE settings SET value='45' WHERE key='dispatch_interval_min' AND value='30' AND account_id IS NULL;
      UPDATE settings SET value='15' WHERE key='schedule_jitter_min' AND value='5' AND account_id IS NULL;
      UPDATE settings SET value='45' WHERE key='schedule_jitter_max' AND value='12' AND account_id IS NULL;
      UPDATE settings SET value='3' WHERE key='format.no_link_hook.weight' AND value='2' AND account_id IS NULL;
      UPDATE settings SET value='2' WHERE key='format.question.weight' AND value='1' AND account_id IS NULL;

      INSERT INTO schema_version (version) VALUES (8);
    `,
  },
];

let _db: Database.Database | null = null;

export function open(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  const currentVersion = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    )
    .get();

  let applied = 0;
  if (currentVersion) {
    const row = db
      .prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
      .get() as { version: number } | undefined;
    applied = row?.version ?? 0;
  }

  for (const migration of MIGRATIONS) {
    if (migration.version > applied) {
      db.exec(migration.sql);
    }
  }

  return db;
}

export function getDb(dbPath: string): Database.Database {
  if (!_db) {
    _db = open(dbPath);
  }
  return _db;
}

export function close(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
