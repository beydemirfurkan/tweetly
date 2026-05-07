import { MigrationInterface, QueryRunner } from 'typeorm';

export class MultiTenantAuth1761800000000 implements MigrationInterface {
  name = 'MultiTenantAuth1761800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email              TEXT NOT NULL,
        email_verified_at  TIMESTAMPTZ,
        status             TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','suspended')),
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_users_email ON users(LOWER(email))`);

    await queryRunner.query(`
      CREATE TABLE api_keys (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        key_hash      TEXT NOT NULL,
        key_prefix    TEXT NOT NULL,
        scopes        JSONB NOT NULL DEFAULT '[]',
        last_used_at  TIMESTAMPTZ,
        expires_at    TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        revoked_at    TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_api_keys_hash ON api_keys(key_hash)`);
    await queryRunner.query(`CREATE INDEX idx_api_keys_user_id ON api_keys(user_id)`);

    await queryRunner.query(`
      CREATE TABLE magic_links (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash   TEXT NOT NULL,
        expires_at   TIMESTAMPTZ NOT NULL,
        consumed_at  TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_magic_links_token_hash ON magic_links(token_hash)`);
    await queryRunner.query(`CREATE INDEX idx_magic_links_user_id ON magic_links(user_id)`);

    // accounts.user_id: add nullable first, assign existing rows to the bootstrap user, then enforce NOT NULL.
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN user_id UUID`);

    const bootstrapEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'admin@tweetly.local').trim().toLowerCase();
    const accountsCount: Array<{ count: string }> = await queryRunner.query(
      `SELECT COUNT(*)::text AS count FROM accounts`,
    );
    const hasAccounts = parseInt(accountsCount[0]?.count ?? '0', 10) > 0;

    if (hasAccounts) {
      const existing: Array<{ id: string }> = await queryRunner.query(
        `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
        [bootstrapEmail],
      );
      let bootstrapUserId: string;
      if (existing.length > 0) {
        bootstrapUserId = existing[0].id;
      } else {
        const inserted: Array<{ id: string }> = await queryRunner.query(
          `INSERT INTO users (email, email_verified_at) VALUES ($1, now()) RETURNING id`,
          [bootstrapEmail],
        );
        bootstrapUserId = inserted[0].id;
      }
      await queryRunner.query(
        `UPDATE accounts SET user_id = $1 WHERE user_id IS NULL`,
        [bootstrapUserId],
      );
    }

    await queryRunner.query(`ALTER TABLE accounts ALTER COLUMN user_id SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE accounts ADD CONSTRAINT fk_accounts_user_id FOREIGN KEY (user_id) REFERENCES users(id)`,
    );
    await queryRunner.query(`CREATE INDEX idx_accounts_user_id ON accounts(user_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_accounts_user_id`);
    await queryRunner.query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS fk_accounts_user_id`);
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS user_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS magic_links`);
    await queryRunner.query(`DROP TABLE IF EXISTS api_keys`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
