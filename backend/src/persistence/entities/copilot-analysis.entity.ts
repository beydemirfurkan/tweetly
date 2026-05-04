import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AnalysisType = 'profile' | 'content' | 'viral_score';

@Entity('copilot_analyses')
@Index('idx_copilot_analyses_user_type', ['userId', 'type'])
export class CopilotAnalysisEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'text' })
  userId!: string;

  @Column({ type: 'text' })
  type!: AnalysisType;

  @Column({ name: 'account_id', type: 'text', nullable: true })
  accountId!: string | null;

  @Column({ name: 'input_data', type: 'jsonb', default: () => `'{}'::jsonb` })
  inputData!: Record<string, unknown>;

  @Column({ name: 'result_data', type: 'jsonb' })
  resultData!: Record<string, unknown>;

  @Column({ name: 'model_used', type: 'text', nullable: true })
  modelUsed!: string | null;

  @Column({ name: 'tokens_used', type: 'integer', nullable: true })
  tokensUsed!: number | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
