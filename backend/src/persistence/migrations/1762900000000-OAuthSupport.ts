import { MigrationInterface, QueryRunner } from 'typeorm';

export class OAuthSupport1762900000000 implements MigrationInterface {
  name = 'OAuthSupport1762900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE oauth_clients (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id           TEXT NOT NULL,
        client_secret_hash  TEXT NOT NULL,
        client_name         TEXT NOT NULL,
        redirect_uris       JSONB NOT NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_oauth_clients_client_id ON oauth_clients(client_id)`,
    );

    await queryRunner.query(
      `ALTER TABLE api_keys ADD COLUMN issued_via TEXT NOT NULL DEFAULT 'manual'`,
    );
    await queryRunner.query(
      `ALTER TABLE api_keys ADD COLUMN oauth_client_id TEXT`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_api_keys_oauth_client_id ON api_keys(oauth_client_id) WHERE oauth_client_id IS NOT NULL`,
    );
    // Partial unique: at most one active (non-revoked) key per (user, oauth client).
    // Re-auth revokes the old key first, then issues a new one — prevents
    // dangling keys in the disconnect/reconnect loop.
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_api_keys_active_oauth ON api_keys(user_id, oauth_client_id) ` +
        `WHERE oauth_client_id IS NOT NULL AND revoked_at IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_api_keys_active_oauth`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_api_keys_oauth_client_id`);
    await queryRunner.query(`ALTER TABLE api_keys DROP COLUMN IF EXISTS oauth_client_id`);
    await queryRunner.query(`ALTER TABLE api_keys DROP COLUMN IF EXISTS issued_via`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_oauth_clients_client_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS oauth_clients`);
  }
}
