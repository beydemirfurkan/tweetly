import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allow deleting an X account by cascading FK references (monitors,
 * webhook_deliveries via the existing monitors→deliveries cascade,
 * and the legacy engagement_config row if present).
 */
export class CascadeAccountDelete1761900000000 implements MigrationInterface {
  name = 'CascadeAccountDelete1761900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // monitors.account_id: drop existing FK and recreate with ON DELETE CASCADE.
    const monitorsConstraint = await queryRunner.query(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'monitors'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%account_id%'`,
    );
    if (Array.isArray(monitorsConstraint) && monitorsConstraint.length > 0) {
      const name = (monitorsConstraint[0] as { conname: string }).conname;
      await queryRunner.query(`ALTER TABLE monitors DROP CONSTRAINT "${name}"`);
    }
    await queryRunner.query(
      `ALTER TABLE monitors
         ADD CONSTRAINT monitors_account_id_fkey
         FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE`,
    );

    // engagement_config.account_id (legacy table — only modify if it still exists).
    const tableExists = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'engagement_config'`,
    );
    if (Array.isArray(tableExists) && tableExists.length > 0) {
      const ecConstraint = await queryRunner.query(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'engagement_config'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%account_id%'`,
      );
      if (Array.isArray(ecConstraint) && ecConstraint.length > 0) {
        const name = (ecConstraint[0] as { conname: string }).conname;
        await queryRunner.query(`ALTER TABLE engagement_config DROP CONSTRAINT "${name}"`);
      }
      await queryRunner.query(
        `ALTER TABLE engagement_config
           ADD CONSTRAINT engagement_config_account_id_fkey
           FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE monitors DROP CONSTRAINT IF EXISTS monitors_account_id_fkey`);
    await queryRunner.query(
      `ALTER TABLE monitors
         ADD CONSTRAINT monitors_account_id_fkey
         FOREIGN KEY (account_id) REFERENCES accounts(id)`,
    );
    const tableExists = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'engagement_config'`,
    );
    if (Array.isArray(tableExists) && tableExists.length > 0) {
      await queryRunner.query(
        `ALTER TABLE engagement_config DROP CONSTRAINT IF EXISTS engagement_config_account_id_fkey`,
      );
      await queryRunner.query(
        `ALTER TABLE engagement_config
           ADD CONSTRAINT engagement_config_account_id_fkey
           FOREIGN KEY (account_id) REFERENCES accounts(id)`,
      );
    }
  }
}
