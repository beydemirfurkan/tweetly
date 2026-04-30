import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('monitors')
export class MonitorEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'text' })
  accountId: string;

  @Column({ name: 'target_handle', type: 'text' })
  targetHandle: string;

  @Column({ name: 'webhook_url', type: 'text' })
  webhookUrl: string;

  @Column({ name: 'event_types', type: 'text', array: true, default: ['tweet.new'] })
  eventTypes: string[];

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'last_check_at', type: 'timestamptz', nullable: true })
  lastCheckAt: Date | null;

  @Column({ name: 'last_tweet_url', type: 'text', nullable: true })
  lastTweetUrl: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
