import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { ActionType } from '../../domain/types/action.types';

@Entity('analytics_events')
export class AnalyticsEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'timestamptz', default: () => 'now()' })
  timestamp!: Date;

  @Index()
  @Column({ type: 'text' })
  type!: string;

  @Column({ name: 'action_type', type: 'text', nullable: true })
  actionType!: ActionType | null;

  @Column({ name: 'action_id', type: 'text', nullable: true })
  actionId!: string | null;

  @Index()
  @Column({ type: 'text', nullable: true })
  format!: string | null;

  @Column({ type: 'text', nullable: true })
  objective!: string | null;

  @Index()
  @Column({ type: 'text' })
  repo!: string;

  @Column({ type: 'text', nullable: true })
  topic!: string | null;

  @Column({ type: 'text', nullable: true })
  source!: string | null;

  @Column({ name: 'tweet_id', type: 'text', nullable: true })
  tweetId!: string | null;

  @Column({ name: 'tweet_url', type: 'text', nullable: true })
  tweetUrl!: string | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs!: number | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Index()
  @Column({ name: 'account_id', type: 'text', nullable: true })
  accountId!: string | null;
}
