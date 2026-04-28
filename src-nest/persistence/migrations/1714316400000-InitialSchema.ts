import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1714316400000 implements MigrationInterface {
  name = 'InitialSchema1714316400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE accounts (
        id            TEXT PRIMARY KEY,
        display_name  TEXT,
        auth_token    TEXT NOT NULL,
        auth_multi    TEXT,
        ct0           TEXT,
        twid          TEXT,
        status        TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','paused','banned')),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_used_at  TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_accounts_status ON accounts(status)`);

    await queryRunner.query(`
      CREATE TABLE settings (
        key         TEXT NOT NULL,
        account_id  TEXT NOT NULL DEFAULT '',
        value       TEXT NOT NULL,
        type        TEXT NOT NULL DEFAULT 'string',
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (key, account_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_settings_account_id ON settings(account_id)`);

    await queryRunner.query(`
      CREATE TABLE content_memory (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        repo        TEXT NOT NULL,
        text_hash   TEXT NOT NULL,
        signature   TEXT NOT NULL,
        text        TEXT NOT NULL,
        account_id  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_content_memory_text_hash ON content_memory(text_hash)`);
    await queryRunner.query(`CREATE INDEX idx_content_memory_repo ON content_memory(repo)`);
    await queryRunner.query(`CREATE INDEX idx_content_memory_account_id ON content_memory(account_id)`);
    await queryRunner.query(`CREATE INDEX idx_content_memory_created_at ON content_memory(created_at)`);

    await queryRunner.query(`
      CREATE TABLE analytics_events (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp      TIMESTAMPTZ NOT NULL DEFAULT now(),
        type           TEXT NOT NULL,
        action_type    TEXT,
        action_id      TEXT,
        format         TEXT,
        objective      TEXT,
        repo           TEXT NOT NULL,
        topic          TEXT,
        source         TEXT,
        tweet_id       TEXT,
        tweet_url      TEXT,
        duration_ms    INTEGER,
        error_message  TEXT,
        account_id     TEXT
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_analytics_timestamp ON analytics_events(timestamp)`);
    await queryRunner.query(`CREATE INDEX idx_analytics_type ON analytics_events(type)`);
    await queryRunner.query(`CREATE INDEX idx_analytics_format ON analytics_events(format)`);
    await queryRunner.query(`CREATE INDEX idx_analytics_repo ON analytics_events(repo)`);
    await queryRunner.query(`CREATE INDEX idx_analytics_account_id ON analytics_events(account_id)`);

    await queryRunner.query(`
      CREATE TABLE control_state (
        key         TEXT NOT NULL,
        account_id  TEXT NOT NULL DEFAULT '',
        value       TEXT NOT NULL,
        PRIMARY KEY (key, account_id)
      )
    `);

    const actionTables: Array<{ name: string; specific: string }> = [
      {
        name: 'post_actions',
        specific: `
          text              TEXT NOT NULL,
          media_path        TEXT,
          result_tweet_id   TEXT,
          result_tweet_url  TEXT,
          result_sent_at    TIMESTAMPTZ
        `,
      },
      {
        name: 'reply_actions',
        specific: `
          text              TEXT NOT NULL,
          parent_tweet_url  TEXT NOT NULL,
          result_tweet_id   TEXT,
          result_tweet_url  TEXT,
          result_sent_at    TIMESTAMPTZ
        `,
      },
      {
        name: 'retweet_actions',
        specific: `
          target_tweet_url  TEXT NOT NULL,
          target_tweet_id   TEXT,
          result_at         TIMESTAMPTZ
        `,
      },
      {
        name: 'like_actions',
        specific: `
          target_tweet_url  TEXT NOT NULL,
          target_tweet_id   TEXT,
          result_at         TIMESTAMPTZ
        `,
      },
      {
        name: 'follow_actions',
        specific: `
          target_handle  TEXT NOT NULL,
          result_at      TIMESTAMPTZ
        `,
      },
      {
        name: 'quote_actions',
        specific: `
          text              TEXT NOT NULL,
          target_tweet_url  TEXT NOT NULL,
          result_tweet_id   TEXT,
          result_tweet_url  TEXT,
          result_sent_at    TIMESTAMPTZ
        `,
      },
      {
        name: 'bookmark_actions',
        specific: `
          target_tweet_url  TEXT NOT NULL,
          target_tweet_id   TEXT,
          result_at         TIMESTAMPTZ
        `,
      },
    ];

    for (const t of actionTables) {
      await queryRunner.query(`
        CREATE TABLE ${t.name} (
          id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          status            TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','claimed','running','succeeded','failed','dead','cancelled')),
          account_id        TEXT NOT NULL,
          idempotency_key   TEXT NOT NULL UNIQUE,
          parent_action_ref TEXT,
          attempts          INTEGER NOT NULL DEFAULT 0,
          max_attempts      INTEGER NOT NULL DEFAULT 3,
          scheduled_at      TIMESTAMPTZ NOT NULL,
          locked_until      TIMESTAMPTZ,
          locked_by         TEXT,
          last_error        TEXT,
          error_class       TEXT
                             CHECK (error_class IS NULL OR error_class IN ('auth','rate_limit','transient','permanent')),
          metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          ${t.specific.trim()}
        )
      `);
      await queryRunner.query(
        `CREATE INDEX idx_${t.name}_claim ON ${t.name}(status, scheduled_at) WHERE status='pending'`,
      );
      await queryRunner.query(
        `CREATE INDEX idx_${t.name}_account_status ON ${t.name}(account_id, status)`,
      );
      await queryRunner.query(
        `CREATE INDEX idx_${t.name}_parent ON ${t.name}(parent_action_ref) WHERE parent_action_ref IS NOT NULL`,
      );
    }

    const succeededAtExpr = (table: string): string =>
      ['post_actions', 'reply_actions', 'quote_actions'].includes(table)
        ? 'result_sent_at'
        : 'result_at';

    for (const t of actionTables) {
      await queryRunner.query(
        `CREATE INDEX idx_${t.name}_rate_limit ON ${t.name}(account_id, ${succeededAtExpr(t.name)}) WHERE status='succeeded'`,
      );
    }

    await queryRunner.query(`
      CREATE VIEW actions_all AS
        SELECT id, 'post'::text     AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM post_actions
        UNION ALL
        SELECT id, 'reply'::text    AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM reply_actions
        UNION ALL
        SELECT id, 'retweet'::text  AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM retweet_actions
        UNION ALL
        SELECT id, 'like'::text     AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM like_actions
        UNION ALL
        SELECT id, 'follow'::text   AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM follow_actions
        UNION ALL
        SELECT id, 'quote'::text    AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM quote_actions
        UNION ALL
        SELECT id, 'bookmark'::text AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM bookmark_actions
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS actions_all`);
    const actionTables = [
      'bookmark_actions',
      'quote_actions',
      'follow_actions',
      'like_actions',
      'retweet_actions',
      'reply_actions',
      'post_actions',
    ];
    for (const t of actionTables) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${t}`);
    }
    await queryRunner.query(`DROP TABLE IF EXISTS control_state`);
    await queryRunner.query(`DROP TABLE IF EXISTS analytics_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS content_memory`);
    await queryRunner.query(`DROP TABLE IF EXISTS settings`);
    await queryRunner.query(`DROP TABLE IF EXISTS accounts`);
  }
}
