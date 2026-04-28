import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AnalyticsService, type FormatStats } from '../analytics/analytics.service';
import type { ActionType, ActionStatus } from '../domain/types/action.types';
import { ACTION_TABLE_CONFIG } from '../action-engine/repositories/action-repository';

export interface QueueDepth {
  type: ActionType;
  pending: number;
  claimed: number;
  running: number;
  failed: number;
  dead: number;
}

export interface ActionRow {
  id: string;
  status: ActionStatus;
  account_id: string;
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
  last_error: string | null;
  error_class: string | null;
  idempotency_key: string;
  created_at: string;
}

@Injectable()
export class AdminApiService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly analytics: AnalyticsService,
  ) {}

  async getQueueDepth(): Promise<QueueDepth[]> {
    const results: QueueDepth[] = [];
    for (const [type, cfg] of Object.entries(ACTION_TABLE_CONFIG) as Array<[ActionType, typeof ACTION_TABLE_CONFIG[ActionType]]>) {
      const rows: Array<{ status: ActionStatus; cnt: string }> = await this.dataSource.query(
        `SELECT status, COUNT(*)::text AS cnt FROM ${cfg.table}
          WHERE status IN ('pending','claimed','running','failed','dead')
          GROUP BY status`,
      );
      const counts: Record<string, number> = {};
      for (const r of rows) counts[r.status] = parseInt(r.cnt, 10);
      results.push({
        type,
        pending: counts.pending ?? 0,
        claimed: counts.claimed ?? 0,
        running: counts.running ?? 0,
        failed: counts.failed ?? 0,
        dead: counts.dead ?? 0,
      });
    }
    return results;
  }

  async listActions(
    type: ActionType,
    status?: ActionStatus,
    accountId?: string,
    limit = 50,
  ): Promise<ActionRow[]> {
    const cfg = ACTION_TABLE_CONFIG[type];
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (accountId) {
      params.push(accountId);
      conditions.push(`account_id = $${params.length}`);
    }
    params.push(limit);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.dataSource.query(
      `SELECT id, status, account_id, attempts, max_attempts, scheduled_at, last_error, error_class, idempotency_key, created_at
         FROM ${cfg.table}
         ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
      params,
    );
  }

  async replayAction(type: ActionType, id: string): Promise<boolean> {
    const cfg = ACTION_TABLE_CONFIG[type];
    const result: Array<{ id: string }> = await this.dataSource.query(
      `UPDATE ${cfg.table}
          SET status='pending', attempts=0, locked_until=NULL, locked_by=NULL,
              last_error=NULL, error_class=NULL, scheduled_at=now(), updated_at=now()
        WHERE id=$1 AND status IN ('dead','failed','cancelled')
        RETURNING id`,
      [id],
    );
    return result.length > 0;
  }

  async cancelAction(type: ActionType, id: string): Promise<boolean> {
    const cfg = ACTION_TABLE_CONFIG[type];
    const result: Array<{ id: string }> = await this.dataSource.query(
      `UPDATE ${cfg.table}
          SET status='cancelled', locked_until=NULL, locked_by=NULL, updated_at=now()
        WHERE id=$1 AND status IN ('pending','failed')
        RETURNING id`,
      [id],
    );
    return result.length > 0;
  }

  async getFormatPerformanceLast7d(): Promise<FormatStats[]> {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    return this.analytics.getFormatPerformance(since);
  }
}
