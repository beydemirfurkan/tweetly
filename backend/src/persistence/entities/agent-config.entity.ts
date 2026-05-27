import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('agent_configs')
@Index('idx_agent_configs_user_id', ['userId'])
@Index('idx_agent_configs_account_id', ['accountId'])
export class AgentConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'account_id', type: 'text' })
  accountId!: string;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ name: 'daily_tweet_target', type: 'integer', default: 3 })
  dailyTweetTarget!: number;

  @Column({ name: 'format_preference', type: 'text', array: true, default: ['punch', 'spark', 'hook'] })
  formatPreference!: string[];

  @Column({ type: 'text', array: true, default: [] })
  topics!: string[];

  @Column({ name: 'tone_override', type: 'text', nullable: true })
  toneOverride!: string | null;

  @Column({ name: 'schedule_interval_minutes', type: 'integer', default: 120 })
  scheduleIntervalMinutes!: number;

  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
