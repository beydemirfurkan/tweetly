import { MigrationInterface, QueryRunner } from 'typeorm';

export class MonitoringSchema1746100000000 implements MigrationInterface {
  name = 'MonitoringSchema1746100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE monitors (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id      TEXT NOT NULL REFERENCES accounts(id),
        target_handle   TEXT NOT NULL,
        webhook_url     TEXT NOT NULL,
        event_types     TEXT[] NOT NULL DEFAULT '{tweet.new}',
        enabled         BOOLEAN NOT NULL DEFAULT true,
        last_check_at   TIMESTAMPTZ,
        last_tweet_url  TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_monitors_account_id ON monitors(account_id)`);
    await queryRunner.query(`CREATE INDEX idx_monitors_enabled ON monitors(enabled)`);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_monitors_account_handle ON monitors(account_id, target_handle)`);

    await queryRunner.query(`
      CREATE TABLE webhook_deliveries (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        monitor_id    UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
        event_type    TEXT NOT NULL,
        payload       JSONB NOT NULL DEFAULT '{}',
        status        TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','delivered','failed')),
        attempts      INT NOT NULL DEFAULT 0,
        last_error    TEXT,
        delivered_at  TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_webhook_deliveries_monitor_id ON webhook_deliveries(monitor_id)`);
    await queryRunner.query(`CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status)`);
    await queryRunner.query(`CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(created_at)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS webhook_deliveries`);
    await queryRunner.query(`DROP TABLE IF EXISTS monitors`);
  }
}
