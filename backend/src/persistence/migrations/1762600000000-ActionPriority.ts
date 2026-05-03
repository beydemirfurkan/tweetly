import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `priority SMALLINT DEFAULT 0` to every action table.
 *
 * Migration-only — no behavior change in this commit. The ClaimWorker still
 * dequeues purely by `scheduled_at ASC`. A follow-up (faz 5b) flips the
 * ordering to `priority DESC, scheduled_at ASC` behind a feature flag, with
 * its own staged rollout. Splitting these two changes keeps the on-disk
 * migration safe to ship today and lets the behavior switch be reverted
 * without a schema rollback.
 *
 * NOT NULL on all rows: existing rows backfill via the column default during
 * ALTER TABLE (Postgres rewrites only when default is non-volatile, which 0
 * is). On Postgres ≥11 this is a metadata-only change.
 */
const ACTION_TABLES = [
  'post_actions',
  'reply_actions',
  'retweet_actions',
  'like_actions',
  'follow_actions',
  'quote_actions',
  'bookmark_actions',
  'unlike_actions',
  'unretweet_actions',
  'unfollow_actions',
  'delete_tweet_actions',
  'dm_actions',
  'profile_update_actions',
  'avatar_update_actions',
  'banner_update_actions',
];

export class ActionPriority1762600000000 implements MigrationInterface {
  name = 'ActionPriority1762600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ACTION_TABLES) {
      await queryRunner.query(`
        ALTER TABLE ${table}
          ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 0
      `);
    }
    // Composite index that makes the future (faz 5b) ordering scan cheap;
    // current FIFO ordering still uses the existing scheduled_at index.
    for (const table of ACTION_TABLES) {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_${table}_priority_scheduled
          ON ${table} (priority DESC, scheduled_at ASC)
          WHERE status = 'pending'
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ACTION_TABLES) {
      await queryRunner.query(`DROP INDEX IF EXISTS idx_${table}_priority_scheduled`);
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS priority`);
    }
  }
}
