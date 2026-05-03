import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ExtractionType =
  | 'user_followers'
  | 'user_following'
  | 'user_tweets'
  | 'user_likes'
  | 'user_mentions'
  | 'tweet_retweeters'
  | 'search_tweets'
  | 'list_members';

export type ExtractionStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ExtractionParams {
  /** For user-targeted extractors. */
  handle?: string;
  /** For tweet-targeted extractors (retweeters). */
  tweetUrl?: string;
  /** For list_members. */
  listId?: string;
  /** For search_tweets. */
  query?: string;
  /** Filter to verified accounts only (user-list extractors). */
  verifiedOnly?: boolean;
}

@Entity('extraction_jobs')
export class ExtractionJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'account_id', type: 'text', nullable: true })
  accountId!: string | null;

  @Column({ type: 'text' })
  type!: ExtractionType;

  @Column({ type: 'jsonb' })
  params!: ExtractionParams;

  @Column({ name: 'max_rows', type: 'int' })
  maxRows!: number;

  @Index()
  @Column({ type: 'text', default: 'queued' })
  status!: ExtractionStatus;

  @Column({ name: 'rows_extracted', type: 'int', default: 0 })
  rowsExtracted!: number;

  @Column({ name: 'file_path', type: 'text', nullable: true })
  filePath!: string | null;

  @Column({ name: 'error_detail', type: 'text', nullable: true })
  errorDetail!: string | null;

  @Column({ name: 'last_cursor', type: 'text', nullable: true })
  lastCursor!: string | null;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;
}
