import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountProfiles1762300000000 implements MigrationInterface {
  name = 'AccountProfiles1762300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE account_profiles (
        account_id  TEXT    NOT NULL PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
        display_name      TEXT    NOT NULL DEFAULT '',
        bio               TEXT    NOT NULL DEFAULT '',
        followers_count   TEXT    NOT NULL DEFAULT '',
        following_count   TEXT    NOT NULL DEFAULT '',
        tweets_count      TEXT    NOT NULL DEFAULT '',
        profile_image_url TEXT    NOT NULL DEFAULT '',
        verified          BOOLEAN NOT NULL DEFAULT FALSE,
        fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS account_profiles`);
  }
}
