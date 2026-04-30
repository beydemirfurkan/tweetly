import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountLoginJobs1762100000000 implements MigrationInterface {
  name = 'AccountLoginJobs1762100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE account_login_jobs (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind                   TEXT NOT NULL CHECK (kind IN ('connect','reauth')),
        target_account_id      TEXT REFERENCES accounts(id) ON DELETE CASCADE,
        status                 TEXT NOT NULL DEFAULT 'queued'
                                 CHECK (status IN ('queued','running','success','failed')),
        username               TEXT NOT NULL,
        email                  TEXT,
        encrypted_password     TEXT,
        encrypted_totp_secret  TEXT,
        save_totp_secret       BOOLEAN NOT NULL DEFAULT FALSE,
        proxy_country          TEXT,
        failure_reason         TEXT
                                 CHECK (failure_reason IN
                                   ('invalid_credentials','captcha_required',
                                    'email_challenge','login_cooldown','unknown')),
        failure_detail         TEXT,
        locked_until           TIMESTAMPTZ,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at             TIMESTAMPTZ,
        finished_at            TIMESTAMPTZ
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_account_login_jobs_user_id ON account_login_jobs(user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_account_login_jobs_target ON account_login_jobs(target_account_id)`,
    );
    // Worker hot path: queued jobs polling.
    await queryRunner.query(
      `CREATE INDEX idx_account_login_jobs_status_created
         ON account_login_jobs(status, created_at)
         WHERE status IN ('queued','running')`,
    );

    await queryRunner.query(
      `ALTER TABLE accounts ADD COLUMN totp_secret_encrypted TEXT`,
    );
    await queryRunner.query(
      `ALTER TABLE accounts ADD COLUMN proxy_country TEXT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS proxy_country`);
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS totp_secret_encrypted`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_account_login_jobs_status_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_account_login_jobs_target`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_account_login_jobs_user_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS account_login_jobs`);
  }
}
