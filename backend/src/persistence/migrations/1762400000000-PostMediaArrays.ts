import { MigrationInterface, QueryRunner } from 'typeorm';

export class PostMediaArrays1762400000000 implements MigrationInterface {
  name = 'PostMediaArrays1762400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // post_actions: support multi-media (max 4 images / 1 video / 1 gif on X)
    // and per-media accessibility alt text. media_path stays for old rows.
    await queryRunner.query(`
      ALTER TABLE post_actions
        ADD COLUMN IF NOT EXISTS media_paths jsonb,
        ADD COLUMN IF NOT EXISTS alt_texts   jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE post_actions
        DROP COLUMN IF EXISTS alt_texts,
        DROP COLUMN IF EXISTS media_paths
    `);
  }
}
