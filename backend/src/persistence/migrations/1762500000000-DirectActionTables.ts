import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds 8 new action tables for previously synchronous write operations:
 *   unlike, unretweet, unfollow, delete_tweet, dm, profile_update,
 *   avatar_update, banner_update
 *
 * This makes every write tool flow through the action engine for uniform
 * retry, idempotency, and observability semantics. The actions_all view is
 * extended with the new types so list_actions / monitoring continue to work.
 */
export class DirectActionTables1762500000000 implements MigrationInterface {
  name = 'DirectActionTables1762500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const actionTables: Array<{ name: string; specific: string }> = [
      {
        name: 'unlike_actions',
        specific: `
          target_tweet_url  TEXT NOT NULL,
          target_tweet_id   TEXT,
          result_at         TIMESTAMPTZ
        `,
      },
      {
        name: 'unretweet_actions',
        specific: `
          target_tweet_url  TEXT NOT NULL,
          target_tweet_id   TEXT,
          result_at         TIMESTAMPTZ
        `,
      },
      {
        name: 'unfollow_actions',
        specific: `
          target_handle  TEXT NOT NULL,
          result_at      TIMESTAMPTZ
        `,
      },
      {
        name: 'delete_tweet_actions',
        specific: `
          target_tweet_url  TEXT NOT NULL,
          target_tweet_id   TEXT,
          result_at         TIMESTAMPTZ
        `,
      },
      {
        name: 'dm_actions',
        specific: `
          target_handle  TEXT NOT NULL,
          message        TEXT NOT NULL,
          result_at      TIMESTAMPTZ
        `,
      },
      {
        name: 'profile_update_actions',
        specific: `
          fields     JSONB NOT NULL,
          result_at  TIMESTAMPTZ
        `,
      },
      {
        name: 'avatar_update_actions',
        specific: `
          file_path  TEXT NOT NULL,
          result_at  TIMESTAMPTZ
        `,
      },
      {
        name: 'banner_update_actions',
        specific: `
          file_path  TEXT NOT NULL,
          result_at  TIMESTAMPTZ
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
      await queryRunner.query(
        `CREATE INDEX idx_${t.name}_rate_limit ON ${t.name}(account_id, result_at) WHERE status='succeeded'`,
      );
    }

    // Rebuild actions_all view to include the new types.
    await queryRunner.query(`DROP VIEW IF EXISTS actions_all`);
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
        UNION ALL
        SELECT id, 'unlike'::text   AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM unlike_actions
        UNION ALL
        SELECT id, 'unretweet'::text AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM unretweet_actions
        UNION ALL
        SELECT id, 'unfollow'::text AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM unfollow_actions
        UNION ALL
        SELECT id, 'delete_tweet'::text AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM delete_tweet_actions
        UNION ALL
        SELECT id, 'dm'::text       AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM dm_actions
        UNION ALL
        SELECT id, 'profile_update'::text AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM profile_update_actions
        UNION ALL
        SELECT id, 'avatar_update'::text AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM avatar_update_actions
        UNION ALL
        SELECT id, 'banner_update'::text AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM banner_update_actions
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS actions_all`);
    // Recreate the original 7-table view for safe rollback.
    await queryRunner.query(`
      CREATE VIEW actions_all AS
        SELECT id, 'post'::text     AS type, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at
          FROM post_actions
        UNION ALL
        SELECT id, 'reply'::text, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at FROM reply_actions
        UNION ALL
        SELECT id, 'retweet'::text, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at FROM retweet_actions
        UNION ALL
        SELECT id, 'like'::text, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at FROM like_actions
        UNION ALL
        SELECT id, 'follow'::text, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at FROM follow_actions
        UNION ALL
        SELECT id, 'quote'::text, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at FROM quote_actions
        UNION ALL
        SELECT id, 'bookmark'::text, account_id, status, scheduled_at, attempts, max_attempts,
               locked_until, locked_by, idempotency_key, parent_action_ref, last_error, error_class,
               metadata, created_at, updated_at FROM bookmark_actions
    `);

    const tables = [
      'banner_update_actions',
      'avatar_update_actions',
      'profile_update_actions',
      'dm_actions',
      'delete_tweet_actions',
      'unfollow_actions',
      'unretweet_actions',
      'unlike_actions',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${t}`);
    }
  }
}
