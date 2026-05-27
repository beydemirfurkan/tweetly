import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgentSystem1763400000000 implements MigrationInterface {
  name = 'AgentSystem1763400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE account_style_profiles (
        account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
        style_profile JSONB,
        custom_instructions TEXT NOT NULL DEFAULT '',
        tweet_language TEXT NOT NULL DEFAULT 'tr',
        analyzed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE agent_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT false,
        daily_tweet_target INTEGER NOT NULL DEFAULT 3,
        format_preference TEXT[] NOT NULL DEFAULT ARRAY['punch', 'spark', 'hook'],
        topics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        tone_override TEXT,
        schedule_interval_minutes INTEGER NOT NULL DEFAULT 120,
        last_run_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX idx_agent_configs_user_id ON agent_configs (user_id);
      CREATE INDEX idx_agent_configs_account_id ON agent_configs (account_id);
      CREATE UNIQUE INDEX idx_agent_configs_account_unique ON agent_configs (account_id);

      CREATE TABLE agent_drafts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_config_id UUID NOT NULL REFERENCES agent_configs(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        format TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        estimated_score FLOAT,
        reasoning TEXT,
        source_topic TEXT,
        action_id TEXT,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX idx_agent_drafts_status ON agent_drafts (status);
      CREATE INDEX idx_agent_drafts_account_id ON agent_drafts (account_id);
      CREATE INDEX idx_agent_drafts_config_id ON agent_drafts (agent_config_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS agent_drafts`);
    await queryRunner.query(`DROP TABLE IF EXISTS agent_configs`);
    await queryRunner.query(`DROP TABLE IF EXISTS account_style_profiles`);
  }
}
