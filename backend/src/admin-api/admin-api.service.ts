import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ActionType, ActionStatus } from '@domain/types/action.types';
import { ACTION_TABLE_CONFIG } from '@persistence/repositories/action-repository';

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

export interface ArchivedDeadActions {
  type: ActionType;
  archived: number;
}

export interface QueueLag {
  type: ActionType;
  oldestPendingSeconds: number;
}

@Injectable()
export class AdminApiService {
  constructor(private readonly dataSource: DataSource) {}

  async getQueueDepth(): Promise<QueueDepth[]> {
    return this.queueDepthInternal(null);
  }

  async getQueueDepthForAccounts(accountIds: string[]): Promise<QueueDepth[]> {
    if (accountIds.length === 0) {
      return (Object.keys(ACTION_TABLE_CONFIG) as ActionType[]).map((type) => ({
        type, pending: 0, claimed: 0, running: 0, failed: 0, dead: 0,
      }));
    }
    return this.queueDepthInternal(accountIds);
  }

  private async queueDepthInternal(accountIds: string[] | null): Promise<QueueDepth[]> {
    const results: QueueDepth[] = [];
    for (const [type, cfg] of Object.entries(ACTION_TABLE_CONFIG) as Array<[ActionType, typeof ACTION_TABLE_CONFIG[ActionType]]>) {
      const filter = accountIds
        ? `WHERE status IN ('pending','claimed','running','failed','dead') AND account_id = ANY($1)`
        : `WHERE status IN ('pending','claimed','running','failed','dead')`;
      const params = accountIds ? [accountIds] : [];
      const rows: Array<{ status: ActionStatus; cnt: string }> = await this.dataSource.query(
        `SELECT status, COUNT(*)::text AS cnt FROM ${cfg.table} ${filter} GROUP BY status`,
        params,
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

  /**
   * Age of the oldest pending action per type, in seconds. A high value
   * means the claim worker can't keep up — either workers are stuck or
   * there's an executor that always fails permanently. Per-type so an
   * isolated stall doesn't get hidden in an aggregate.
   */
  async getQueueLag(): Promise<QueueLag[]> {
    const results: QueueLag[] = [];
    for (const [type, cfg] of Object.entries(ACTION_TABLE_CONFIG) as Array<[ActionType, typeof ACTION_TABLE_CONFIG[ActionType]]>) {
      const rows: Array<{ oldest_seconds: string | null }> = await this.dataSource.query(
        `SELECT EXTRACT(EPOCH FROM (now() - MIN(scheduled_at)))::text AS oldest_seconds
           FROM ${cfg.table}
          WHERE status='pending'`,
      );
      const raw = rows[0]?.oldest_seconds;
      results.push({
        type,
        oldestPendingSeconds: raw === null || raw === undefined ? 0 : Math.max(0, Math.floor(parseFloat(raw))),
      });
    }
    return results;
  }

  async getRecentSucceededCount(accountIds: string[], windowMs: number): Promise<number> {
    if (accountIds.length === 0) return 0;
    const since = new Date(Date.now() - windowMs).toISOString();
    let total = 0;
    for (const cfg of Object.values(ACTION_TABLE_CONFIG)) {
      const rows: Array<{ cnt: string }> = await this.dataSource.query(
        `SELECT COUNT(*)::text AS cnt FROM ${cfg.table}
          WHERE status = 'succeeded' AND account_id = ANY($1) AND updated_at >= $2`,
        [accountIds, since],
      );
      total += parseInt(rows[0]?.cnt ?? '0', 10);
    }
    return total;
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

  async archiveDeadActions(): Promise<ArchivedDeadActions[]> {
    const results: ArchivedDeadActions[] = [];
    for (const [type, cfg] of Object.entries(ACTION_TABLE_CONFIG) as Array<[ActionType, typeof ACTION_TABLE_CONFIG[ActionType]]>) {
      const rows: Array<{ archived: string }> = await this.dataSource.query(
        `WITH archived AS (
           UPDATE ${cfg.table}
              SET status='cancelled', locked_until=NULL, locked_by=NULL, updated_at=now()
            WHERE status='dead'
            RETURNING id
         )
         SELECT COUNT(*)::text AS archived FROM archived`,
      );
      results.push({ type, archived: parseInt(rows[0]?.archived ?? '0', 10) });
    }
    return results;
  }

  async findActionAccountId(type: ActionType, id: string): Promise<string | null> {
    const cfg = ACTION_TABLE_CONFIG[type];
    const rows: Array<{ account_id: string }> = await this.dataSource.query(
      `SELECT account_id FROM ${cfg.table} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0]?.account_id ?? null;
  }

  /**
   * Aggregates dead actions across all action tables for the admin DLQ view.
   * If `type` is provided, only that table is queried (faster). Returns rows
   * tagged with their action type so the admin can pick the right
   * /admin/dead-letter/:type/:id/replay target.
   */
  async listDeadActions(
    type: ActionType | undefined,
    limit: number,
  ): Promise<Array<ActionRow & { type: ActionType }>> {
    const types: ActionType[] = type ? [type] : (Object.keys(ACTION_TABLE_CONFIG) as ActionType[]);
    const out: Array<ActionRow & { type: ActionType }> = [];
    for (const t of types) {
      const rows = await this.listActions(t, 'dead', undefined, limit);
      for (const r of rows) out.push({ ...r, type: t });
    }
    return out
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
}
