import { MigrationInterface, QueryRunner } from 'typeorm';

export class EngagementConfig1714410000000 implements MigrationInterface {
  name = 'EngagementConfig1714410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE engagement_config (
        account_id                       TEXT PRIMARY KEY REFERENCES accounts(id),
        enabled                          BOOLEAN NOT NULL DEFAULT true,
        max_likes_per_day                INT NOT NULL DEFAULT 15,
        max_retweets_per_day             INT NOT NULL DEFAULT 5,
        max_quotes_per_day               INT NOT NULL DEFAULT 2,
        max_bookmarks_per_day            INT NOT NULL DEFAULT 8,
        active_hour_start                INT NOT NULL DEFAULT 9,
        active_hour_end                  INT NOT NULL DEFAULT 23,
        bookmark_own_tweet               BOOLEAN NOT NULL DEFAULT true,
        like_source_tweet                BOOLEAN NOT NULL DEFAULT false,
        retweet_source_tweet             BOOLEAN NOT NULL DEFAULT false,
        timeline_scrape_enabled          BOOLEAN NOT NULL DEFAULT false,
        timeline_scrape_interval_hours   INT NOT NULL DEFAULT 4,
        min_delay_sec                    INT NOT NULL DEFAULT 180,
        max_delay_sec                    INT NOT NULL DEFAULT 1800,
        created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO engagement_config (account_id) VALUES ('test-account')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS engagement_config`);
  }
}
