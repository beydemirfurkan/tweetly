import { MigrationInterface, QueryRunner } from 'typeorm';

export class MagicLinkUnconsumedUniqueIndex1763300000000 implements MigrationInterface {
  name = 'MagicLinkUnconsumedUniqueIndex1763300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Defense-in-depth: even if the atomic UPDATE ... RETURNING CAS in
    // MagicLinkService.consume() ever regresses, the DB-level partial unique
    // index turns a double-redeem into a constraint violation instead of two
    // concurrent successful sessions.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS magic_links_unconsumed_token_uniq
        ON magic_links (token_hash)
        WHERE consumed_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS magic_links_unconsumed_token_uniq`);
  }
}
