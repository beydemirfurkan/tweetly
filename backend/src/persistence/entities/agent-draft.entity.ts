import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type AgentDraftStatus = 'pending' | 'approved' | 'rejected' | 'published';

@Entity('agent_drafts')
@Index('idx_agent_drafts_status', ['status'])
@Index('idx_agent_drafts_account_id', ['accountId'])
@Index('idx_agent_drafts_config_id', ['agentConfigId'])
export class AgentDraftEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'agent_config_id', type: 'uuid' })
  agentConfigId!: string;

  @Column({ name: 'account_id', type: 'text' })
  accountId!: string;

  @Column({ type: 'text' })
  text!: string;

  @Column({ type: 'text' })
  format!: string;

  @Column({ type: 'text', default: 'pending' })
  status!: AgentDraftStatus;

  @Column({ name: 'estimated_score', type: 'float', nullable: true })
  estimatedScore!: number | null;

  @Column({ type: 'text', nullable: true })
  reasoning!: string | null;

  @Column({ name: 'source_topic', type: 'text', nullable: true })
  sourceTopic!: string | null;

  @Column({ name: 'action_id', type: 'text', nullable: true })
  actionId!: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
