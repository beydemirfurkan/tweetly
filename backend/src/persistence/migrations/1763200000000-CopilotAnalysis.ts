import { MigrationInterface, QueryRunner } from 'typeorm';

export class CopilotAnalysis1763200000000 implements MigrationInterface {
  name = 'CopilotAnalysis1763200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE copilot_analyses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        account_id TEXT,
        input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        result_data JSONB NOT NULL,
        model_used TEXT,
        tokens_used INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX idx_copilot_analyses_user_type ON copilot_analyses (user_id, type);
      CREATE INDEX idx_copilot_analyses_user_id ON copilot_analyses (user_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS copilot_analyses`);
  }
}
