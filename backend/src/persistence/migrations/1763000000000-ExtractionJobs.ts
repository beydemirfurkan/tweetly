import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtractionJobs1763000000000 implements MigrationInterface {
  name = 'ExtractionJobs1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE extraction_jobs (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_id      TEXT REFERENCES accounts(id) ON DELETE SET NULL,
        type            TEXT NOT NULL CHECK (type IN (
                          'user_followers','user_following','user_tweets',
                          'user_likes','user_mentions','tweet_retweeters',
                          'search_tweets','list_members'
                        )),
        params          JSONB NOT NULL,
        max_rows        INTEGER NOT NULL CHECK (max_rows > 0 AND max_rows <= 100000),
        status          TEXT NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
        rows_extracted  INTEGER NOT NULL DEFAULT 0,
        file_path       TEXT,
        error_detail    TEXT,
        last_cursor     TEXT,
        locked_until    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at      TIMESTAMPTZ,
        finished_at     TIMESTAMPTZ
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_extraction_jobs_user_id ON extraction_jobs(user_id, created_at DESC)`,
    );
    // Worker hot path: queued jobs polling.
    await queryRunner.query(
      `CREATE INDEX idx_extraction_jobs_status_created
         ON extraction_jobs(status, created_at)
         WHERE status IN ('queued','running')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_extraction_jobs_status_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_extraction_jobs_user_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS extraction_jobs`);
  }
}
