import { MigrationInterface, QueryRunner } from 'typeorm';

export class RevertClerkAuth1762800000000 implements MigrationInterface {
  name = 'RevertClerkAuth1762800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_clerk_user_id`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS clerk_user_id`);

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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_magic_links_token_hash`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_magic_links_user_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS magic_links`);

    await queryRunner.query(`ALTER TABLE users ADD COLUMN clerk_user_id TEXT`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_users_clerk_user_id ON users(clerk_user_id) WHERE clerk_user_id IS NOT NULL`,
    );
  }
}
