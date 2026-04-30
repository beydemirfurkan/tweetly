import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add webhook_secret to monitors so deliveries can be HMAC-signed
 * (X-Tweetly-Signature: t=<timestamp>,v1=<sha256-hex>).
 *
 * Existing monitors are back-filled with a random secret so they keep
 * working without a manual rotation step.
 */
export class WebhookSecret1762000000000 implements MigrationInterface {
  name = 'WebhookSecret1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE monitors ADD COLUMN webhook_secret TEXT`);
    await queryRunner.query(
      `UPDATE monitors SET webhook_secret = encode(gen_random_bytes(32), 'hex') WHERE webhook_secret IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE monitors DROP COLUMN IF EXISTS webhook_secret`);
  }
}
