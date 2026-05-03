import { DataSource } from 'typeorm';
import type { ActionType, ActionStatus, ErrorClass } from '../../domain/types/action.types';

export interface ClaimedActionRow {
  id: string;
  status: ActionStatus;
  account_id: string;
  attempts: number;
  max_attempts: number;
  scheduled_at: Date;
  metadata: Record<string, unknown>;
  idempotency_key: string;
  parent_action_ref: string | null;
  text?: string;
  media_path?: string | null;
  media_paths?: string[] | null;
  alt_texts?: string[] | null;
  parent_tweet_url?: string;
  target_tweet_url?: string;
  target_handle?: string;
  message?: string;
  fields?: Record<string, unknown>;
  file_path?: string;
}

export interface ActionTableConfig {
  type: ActionType;
  table: string;
  hasResultSentAt: boolean;
}

export const ACTION_TABLE_CONFIG: Record<ActionType, ActionTableConfig> = {
  post: { type: 'post', table: 'post_actions', hasResultSentAt: true },
  reply: { type: 'reply', table: 'reply_actions', hasResultSentAt: true },
  retweet: { type: 'retweet', table: 'retweet_actions', hasResultSentAt: false },
  like: { type: 'like', table: 'like_actions', hasResultSentAt: false },
  follow: { type: 'follow', table: 'follow_actions', hasResultSentAt: false },
  quote: { type: 'quote', table: 'quote_actions', hasResultSentAt: true },
  bookmark: { type: 'bookmark', table: 'bookmark_actions', hasResultSentAt: false },
  unlike: { type: 'unlike', table: 'unlike_actions', hasResultSentAt: false },
  unretweet: { type: 'unretweet', table: 'unretweet_actions', hasResultSentAt: false },
  unfollow: { type: 'unfollow', table: 'unfollow_actions', hasResultSentAt: false },
  delete_tweet: { type: 'delete_tweet', table: 'delete_tweet_actions', hasResultSentAt: false },
  dm: { type: 'dm', table: 'dm_actions', hasResultSentAt: false },
  profile_update: { type: 'profile_update', table: 'profile_update_actions', hasResultSentAt: false },
  avatar_update: { type: 'avatar_update', table: 'avatar_update_actions', hasResultSentAt: false },
  banner_update: { type: 'banner_update', table: 'banner_update_actions', hasResultSentAt: false },
};

export class GenericActionRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cfg: ActionTableConfig,
  ) {}

  /**
   * Bir worker turunda en fazla `batchSize` aksiyon claim eder.
   * Postgres `FOR UPDATE SKIP LOCKED` ile concurrent worker'lar güvenli.
   */
  async claimBatch(workerId: string, batchSize: number, lockTtlSec = 300): Promise<ClaimedActionRow[]> {
    const sql = `
      WITH c AS (
        SELECT id FROM ${this.cfg.table}
         WHERE status IN ('pending', 'failed')
            AND scheduled_at <= now()
            AND (locked_until IS NULL OR locked_until < now())
            AND attempts < max_attempts
         ORDER BY scheduled_at
         FOR UPDATE SKIP LOCKED
         LIMIT $2
      )
      UPDATE ${this.cfg.table} a
         SET status = 'claimed',
             locked_until = now() + ($3 || ' seconds')::interval,
             locked_by = $1,
             updated_at = now()
        FROM c
       WHERE a.id = c.id
      RETURNING a.*
    `;
    const result = (await this.dataSource.query(sql, [workerId, batchSize, lockTtlSec])) as unknown;
    // TypeORM PG driver bazı UPDATE..RETURNING durumlarında [rows, count] tuple'ı döndürür.
    if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0])) {
      return result[0] as ClaimedActionRow[];
    }
    return result as ClaimedActionRow[];
  }

  async markRunning(id: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE ${this.cfg.table}
          SET status='running', updated_at=now()
        WHERE id=$1 AND status='claimed'`,
      [id],
    );
  }

  async markSucceeded(
    id: string,
    fields: {
      tweetId?: string | null;
      tweetUrl?: string | null;
      sentAt?: Date | null;
      resultAt?: Date | null;
    },
  ): Promise<void> {
    if (this.cfg.hasResultSentAt) {
      await this.dataSource.query(
        `UPDATE ${this.cfg.table}
            SET status='succeeded',
                result_tweet_id=$2,
                result_tweet_url=$3,
                result_sent_at=COALESCE($4, now()),
                locked_until=NULL,
                locked_by=NULL,
                updated_at=now()
          WHERE id=$1`,
        [id, fields.tweetId ?? null, fields.tweetUrl ?? null, fields.sentAt ?? null],
      );
    } else {
      await this.dataSource.query(
        `UPDATE ${this.cfg.table}
            SET status='succeeded',
                result_at=COALESCE($2, now()),
                locked_until=NULL,
                locked_by=NULL,
                updated_at=now()
          WHERE id=$1`,
        [id, fields.resultAt ?? null],
      );
    }
  }

  async markFailed(
    id: string,
    next: {
      status: 'failed' | 'dead' | 'pending';
      attempts: number;
      lastError: string;
      errorClass: ErrorClass;
      scheduledAt?: Date;
    },
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE ${this.cfg.table}
          SET status=$2,
              attempts=$3,
              last_error=$4,
              error_class=$5,
              scheduled_at=COALESCE($6, scheduled_at),
              locked_until=NULL,
              locked_by=NULL,
              updated_at=now()
        WHERE id=$1`,
      [
        id,
        next.status,
        next.attempts,
        next.lastError,
        next.errorClass,
        next.scheduledAt ?? null,
      ],
    );
  }

  async insertIfAbsent(
    fields: {
      idempotencyKey: string;
      accountId: string;
      scheduledAt: Date;
      maxAttempts?: number;
      parentActionRef?: string | null;
      metadata?: Record<string, unknown>;
      typeSpecific: Record<string, unknown>;
    },
  ): Promise<string | null> {
    const specificCols = Object.keys(fields.typeSpecific);
    const specificVals = Object.values(fields.typeSpecific);
    const baseCols = [
      'idempotency_key',
      'account_id',
      'scheduled_at',
      'max_attempts',
      'parent_action_ref',
      'metadata',
    ];
    const allCols = [...baseCols, ...specificCols];
    const placeholders = allCols.map((_, i) => `$${i + 1}`).join(', ');
    const params: unknown[] = [
      fields.idempotencyKey,
      fields.accountId,
      fields.scheduledAt,
      fields.maxAttempts ?? 3,
      fields.parentActionRef ?? null,
      JSON.stringify(fields.metadata ?? {}),
      ...specificVals,
    ];

    const rows = (await this.dataSource.query(
      `INSERT INTO ${this.cfg.table} (${allCols.join(', ')})
       VALUES (${placeholders})
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      params,
    )) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }
}
