import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions, readDatabaseEnv } from '../config/database.config';
import {
  buildPostKey,
  buildReplyKey,
  extractTweetIdFromUrl,
  inferActionType,
  parseControlStateKey,
  statusMap,
} from './migration-helpers';

dotenv.config();

interface Args {
  sqlitePath: string;
  dryRun: boolean;
  truncate: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    sqlitePath:
      process.env.SQLITE_DB_PATH ?? path.resolve(process.cwd(), 'data/tweetly.db'),
    dryRun: false,
    truncate: false,
  };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--truncate') args.truncate = true;
    else if (a.startsWith('--sqlite=')) args.sqlitePath = a.slice('--sqlite='.length);
  }
  return args;
}

interface Counts {
  [table: string]: { source: number; written: number };
}

interface SqliteTweet {
  id: string;
  status: 'pending' | 'sent' | 'failed' | 'dead';
  attempts: number;
  created_at: string;
  scheduled_at: string;
  repo: string;
  url: string;
  text: string;
  format: string | null;
  objective: string | null;
  topic: string | null;
  source: string | null;
  score: number | null;
  parent_id: string | null;
  thread_group_id: string | null;
  tweet_id: string | null;
  tweet_url: string | null;
  sent_at: string | null;
  last_error: string | null;
  last_tried_at: string | null;
  campaign_id: string | null;
  account_id: string | null;
  media_path: string | null;
}

function metadataFor(t: SqliteTweet): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (t.format) meta.format = t.format;
  if (t.objective) meta.objective = t.objective;
  if (t.topic) meta.topic = t.topic;
  if (t.source) meta.source = t.source;
  if (t.score != null) meta.score = t.score;
  if (t.thread_group_id) meta.threadGroupId = t.thread_group_id;
  if (t.campaign_id) meta.campaignId = t.campaign_id;
  if (t.url) meta.repoUrl = t.url;
  meta.legacyId = t.id;
  return meta;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(args.sqlitePath)) {
    console.error(`SQLite dosyası bulunamadı: ${args.sqlitePath}`);
    process.exit(1);
  }

  console.log(`SQLite kaynak : ${args.sqlitePath}`);
  console.log(`Mod           : ${args.dryRun ? 'dry-run' : 'gerçek'}`);
  console.log(`Truncate      : ${args.truncate ? 'evet' : 'hayır'}`);
  console.log('');

  const sqlite = new Database(args.sqlitePath, { readonly: true });

  const ds = new DataSource(buildDataSourceOptions(readDatabaseEnv()));
  await ds.initialize();

  const counts: Counts = {};
  const queryRunner = ds.createQueryRunner();
  await queryRunner.connect();

  try {
    if (args.truncate && !args.dryRun) {
      console.log('Hedef tabloları temizliyorum...');
      const truncateOrder = [
        'analytics_events',
        'content_memory',
        'control_state',
        'settings',
        'bookmark_actions',
        'quote_actions',
        'follow_actions',
        'like_actions',
        'retweet_actions',
        'reply_actions',
        'post_actions',
        'accounts',
      ];
      for (const t of truncateOrder) {
        await queryRunner.query(`TRUNCATE ${t} CASCADE`);
      }
    }

    await queryRunner.startTransaction();

    counts.accounts = await migrateAccounts(sqlite, queryRunner, args.dryRun);
    counts.settings = await migrateSettings(sqlite, queryRunner, args.dryRun);
    counts.content_memory = await migrateContentMemory(sqlite, queryRunner, args.dryRun);
    counts.analytics_events = await migrateAnalyticsEvents(sqlite, queryRunner, args.dryRun);
    counts.control_state = await migrateControlState(sqlite, queryRunner, args.dryRun);

    const tweetsResult = await migrateTweets(sqlite, queryRunner, args.dryRun);
    counts.post_actions = tweetsResult.posts;
    counts.reply_actions = tweetsResult.replies;

    if (args.dryRun) {
      await queryRunner.rollbackTransaction();
      console.log('\nDRY-RUN — değişiklik commit edilmedi.');
    } else {
      await queryRunner.commitTransaction();
      console.log('\nCommit edildi.');
    }
  } catch (err) {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    throw err;
  } finally {
    await queryRunner.release();
    await ds.destroy();
    sqlite.close();
  }

  console.log('\n=== Diff Raporu ===');
  console.log('tablo                  kaynak  yazılan');
  console.log('---------------------- ------- -------');
  for (const [table, c] of Object.entries(counts)) {
    const ok = c.source === c.written;
    const flag = ok ? ' ' : '!';
    console.log(`${table.padEnd(22)} ${String(c.source).padStart(7)} ${String(c.written).padStart(7)} ${flag}`);
  }
}

interface TableCount {
  source: number;
  written: number;
}

async function migrateAccounts(
  sqlite: Database.Database,
  qr: import('typeorm').QueryRunner,
  dryRun: boolean,
): Promise<TableCount> {
  const rows = sqlite.prepare(`SELECT * FROM accounts`).all() as Array<{
    id: string;
    display_name: string | null;
    auth_token: string;
    auth_multi: string | null;
    ct0: string | null;
    twid: string | null;
    status: string;
    created_at: string;
    last_used_at: string | null;
  }>;
  let written = 0;
  for (const r of rows) {
    if (dryRun) {
      written++;
      continue;
    }
    await qr.query(
      `INSERT INTO accounts(id, display_name, auth_token, auth_multi, ct0, twid, status, created_at, last_used_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        r.id,
        r.display_name,
        r.auth_token,
        r.auth_multi,
        r.ct0,
        r.twid,
        r.status,
        r.created_at,
        r.last_used_at,
      ],
    );
    written++;
  }
  return { source: rows.length, written };
}

async function migrateSettings(
  sqlite: Database.Database,
  qr: import('typeorm').QueryRunner,
  dryRun: boolean,
): Promise<TableCount> {
  const rows = sqlite.prepare(`SELECT * FROM settings`).all() as Array<{
    key: string;
    account_id: string | null;
    value: string;
    type: string;
    updated_at: string;
  }>;
  let written = 0;
  for (const r of rows) {
    if (dryRun) {
      written++;
      continue;
    }
    await qr.query(
      `INSERT INTO settings(key, account_id, value, type, updated_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (key, account_id) DO NOTHING`,
      [r.key, r.account_id ?? '', r.value, r.type, r.updated_at],
    );
    written++;
  }
  return { source: rows.length, written };
}

async function migrateContentMemory(
  sqlite: Database.Database,
  qr: import('typeorm').QueryRunner,
  dryRun: boolean,
): Promise<TableCount> {
  const rows = sqlite.prepare(`SELECT * FROM content_memory`).all() as Array<{
    id: number;
    repo: string;
    text_hash: string;
    signature: string;
    text: string;
    account_id: string | null;
    created_at: string;
  }>;
  let written = 0;
  for (const r of rows) {
    if (dryRun) {
      written++;
      continue;
    }
    await qr.query(
      `INSERT INTO content_memory(repo, text_hash, signature, text, account_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [r.repo, r.text_hash, r.signature, r.text, r.account_id, r.created_at],
    );
    written++;
  }
  return { source: rows.length, written };
}

async function migrateAnalyticsEvents(
  sqlite: Database.Database,
  qr: import('typeorm').QueryRunner,
  dryRun: boolean,
): Promise<TableCount> {
  const rows = sqlite.prepare(`SELECT * FROM analytics_events`).all() as Array<{
    id: string;
    timestamp: string;
    type: string;
    format: string | null;
    objective: string | null;
    repo: string;
    topic: string | null;
    source: string | null;
    tweet_id: string | null;
    tweet_url: string | null;
    duration_ms: number | null;
    error_message: string | null;
    account_id: string | null;
  }>;
  let written = 0;
  for (const r of rows) {
    const actionType = inferActionType(r.type);
    if (dryRun) {
      written++;
      continue;
    }
    await qr.query(
      `INSERT INTO analytics_events
        (timestamp, type, action_type, action_id, format, objective, repo, topic, source,
         tweet_id, tweet_url, duration_ms, error_message, account_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        r.timestamp,
        r.type,
        actionType,
        null,
        r.format,
        r.objective,
        r.repo,
        r.topic,
        r.source,
        r.tweet_id,
        r.tweet_url,
        r.duration_ms,
        r.error_message,
        r.account_id,
      ],
    );
    written++;
  }
  return { source: rows.length, written };
}

async function migrateControlState(
  sqlite: Database.Database,
  qr: import('typeorm').QueryRunner,
  dryRun: boolean,
): Promise<TableCount> {
  const rows = sqlite.prepare(`SELECT * FROM control_state`).all() as Array<{
    key: string;
    value: string;
  }>;
  let written = 0;
  for (const r of rows) {
    const { accountId, field } = parseControlStateKey(r.key);
    if (dryRun) {
      written++;
      continue;
    }
    await qr.query(
      `INSERT INTO control_state(key, account_id, value)
       VALUES ($1,$2,$3)
       ON CONFLICT (key, account_id) DO UPDATE SET value = EXCLUDED.value`,
      [field, accountId, r.value],
    );
    written++;
  }
  return { source: rows.length, written };
}

interface TweetMigrationResult {
  posts: TableCount;
  replies: TableCount;
}

async function migrateTweets(
  sqlite: Database.Database,
  qr: import('typeorm').QueryRunner,
  dryRun: boolean,
): Promise<TweetMigrationResult> {
  const rows = sqlite.prepare(`SELECT * FROM tweets`).all() as SqliteTweet[];

  const byId = new Map<string, SqliteTweet>(rows.map((r) => [r.id, r]));
  const idMap = new Map<string, { table: 'post_actions' | 'reply_actions'; uuid: string }>();

  let postSource = 0;
  let replySource = 0;
  for (const t of rows) {
    if (t.parent_id) replySource++;
    else postSource++;
  }

  const insertPosts: SqliteTweet[] = [];
  const insertReplies: SqliteTweet[] = [];
  for (const t of rows) {
    if (t.parent_id) insertReplies.push(t);
    else insertPosts.push(t);
  }

  let postWritten = 0;
  for (const t of insertPosts) {
    const accountId = t.account_id ?? 'legacy';
    const status = statusMap(t.status);
    const idemKey = buildPostKey(accountId, t.text, t.created_at);

    if (dryRun) {
      postWritten++;
      continue;
    }

    const inserted = (await qr.query(
      `INSERT INTO post_actions
        (status, account_id, idempotency_key, attempts, max_attempts, scheduled_at,
         last_error, metadata, created_at, updated_at,
         text, media_path, result_tweet_id, result_tweet_url, result_sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        status,
        accountId,
        idemKey,
        t.attempts,
        3,
        t.scheduled_at,
        t.last_error,
        JSON.stringify(metadataFor(t)),
        t.created_at,
        t.last_tried_at ?? t.created_at,
        t.text,
        t.media_path,
        t.tweet_id,
        t.tweet_url,
        t.sent_at,
      ],
    )) as Array<{ id: string }>;
    if (inserted[0]) {
      idMap.set(t.id, { table: 'post_actions', uuid: inserted[0].id });
      postWritten++;
    }
  }

  let replyWritten = 0;
  for (const t of insertReplies) {
    const accountId = t.account_id ?? 'legacy';
    const status = statusMap(t.status);
    const parent = t.parent_id ? byId.get(t.parent_id) : null;
    const parentTweetUrl = parent?.tweet_url ?? null;
    const parentTweetId = extractTweetIdFromUrl(parentTweetUrl) ?? t.parent_id ?? 'unknown';

    if (!parentTweetUrl) {
      console.warn(`reply ${t.id} parent URL bulunamadı, atlanıyor.`);
      continue;
    }

    const idemKey = buildReplyKey(accountId, parentTweetId, t.text);

    if (dryRun) {
      replyWritten++;
      continue;
    }

    const parentRef = parent ? idMap.get(parent.id) : null;
    const parentActionRef = parentRef ? `${parentRef.table}:${parentRef.uuid}` : null;

    const inserted = (await qr.query(
      `INSERT INTO reply_actions
        (status, account_id, idempotency_key, parent_action_ref, attempts, max_attempts, scheduled_at,
         last_error, metadata, created_at, updated_at,
         text, parent_tweet_url, result_tweet_id, result_tweet_url, result_sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        status,
        accountId,
        idemKey,
        parentActionRef,
        t.attempts,
        3,
        t.scheduled_at,
        t.last_error,
        JSON.stringify(metadataFor(t)),
        t.created_at,
        t.last_tried_at ?? t.created_at,
        t.text,
        parentTweetUrl,
        t.tweet_id,
        t.tweet_url,
        t.sent_at,
      ],
    )) as Array<{ id: string }>;
    if (inserted[0]) {
      idMap.set(t.id, { table: 'reply_actions', uuid: inserted[0].id });
      replyWritten++;
    }
  }

  return {
    posts: { source: postSource, written: postWritten },
    replies: { source: replySource, written: replyWritten },
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
