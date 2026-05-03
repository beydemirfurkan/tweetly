import { MigrationInterface, QueryRunner } from 'typeorm';

const REASONS = [
  'invalid_credentials',
  'captcha_required',
  'email_challenge',
  'email_verification_required',
  'suspicious_login_blocked',
  'login_cooldown',
  'cookies_missing',
  'home_not_reached',
  'account_locked',
  'phone_verification_required',
  'unknown',
];

const PRIOR_REASONS = [
  'invalid_credentials',
  'captcha_required',
  'email_challenge',
  'email_verification_required',
  'suspicious_login_blocked',
  'login_cooldown',
  'cookies_missing',
  'home_not_reached',
  'unknown',
];

export class MoreLoginFailureReasons1763100000000 implements MigrationInterface {
  name = 'MoreLoginFailureReasons1763100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await replaceFailureReasonConstraint(queryRunner, REASONS);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE account_login_jobs
          SET failure_reason = 'unknown'
        WHERE failure_reason IS NOT NULL
          AND failure_reason NOT IN (${sqlStringList(PRIOR_REASONS)})`,
    );
    await replaceFailureReasonConstraint(queryRunner, PRIOR_REASONS);
  }
}

async function replaceFailureReasonConstraint(
  queryRunner: QueryRunner,
  reasons: string[],
): Promise<void> {
  await queryRunner.query(
    `ALTER TABLE account_login_jobs DROP CONSTRAINT IF EXISTS account_login_jobs_failure_reason_check`,
  );
  await queryRunner.query(
    `ALTER TABLE account_login_jobs
       ADD CONSTRAINT account_login_jobs_failure_reason_check
       CHECK (failure_reason IS NULL OR failure_reason IN (${sqlStringList(reasons)}))`,
  );
}

function sqlStringList(values: string[]): string {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(',');
}
