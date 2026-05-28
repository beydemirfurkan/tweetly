import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { ActionStatus } from '@domain/types/action.types';
import { ACTION_TABLE_CONFIG } from './action-repository';

export interface AdminActionRow {
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

export type StatusCounts = Record<
  'pending' | 'claimed' | 'running' | 'failed' | 'dead',
  number
>;

/**
 * Cross-cutting admin queries against any action table. AdminApiService used
 * to issue these as raw SQL inline; centralising them here keeps the SQL in
 * one file and lets us change the schema (column names, indexes) without
 * grepping through service code.
 *
 * GenericActionRepository (sibling) is bound to a single table at construction
 * time and is used by enqueue/claim — different lifecycle, different shape.
 */
@Injectable()
export class ActionAdminRepository {
  constructor(private readonly dataSource: DataSource) {}

  async statusCounts(table: string, accountIds?: string[] | null): Promise<StatusCounts> {
    const filter = accountIds && accountIds.length > 0
      ? `WHERE status IN ('pending','claimed','running','failed','dead') AND account_id = ANY($1)`
      : `WHERE status IN ('pending','claimed','running','failed','dead')`;
    const params = accountIds && accountIds.length > 0 ? [accountIds] : [];
    const rows: Array<{ status: ActionStatus; cnt: string }> = await this.dataSource.query(
      `SELECT status, COUNT(*)::text AS cnt FROM ${table} ${filter} GROUP BY status`,
      params,
    );
    const out: StatusCounts = { pending: 0, claimed: 0, running: 0, failed: 0, dead: 0 };
    for (const r of rows) {
      if (r.status in out) (out as Record<string, number>)[r.status] = parseInt(r.cnt, 10);
    }
    return out;
  }

  async oldestPendingSeconds(table: string): Promise<number> {
    const rows: Array<{ oldest_seconds: string | null }> = await this.dataSource.query(
      `SELECT EXTRACT(EPOCH FROM (now() - MIN(scheduled_at)))::text AS oldest_seconds
         FROM ${table}
        WHERE status='pending'`,
    );
    const raw = rows[0]?.oldest_seconds;
    return raw === null || raw === undefined ? 0 : Math.max(0, Math.floor(parseFloat(raw)));
  }

  async countSucceededSince(table: string, accountIds: string[], since: Date): Promise<number> {
    if (accountIds.length === 0) return 0;
    const rows: Array<{ cnt: string }> = await this.dataSource.query(
      `SELECT COUNT(*)::text AS cnt FROM ${table}
        WHERE status = 'succeeded' AND account_id = ANY($1) AND updated_at >= $2`,
      [accountIds, since.toISOString()],
    );
    return parseInt(rows[0]?.cnt ?? '0', 10);
  }

  async listActions(
    table: string,
    status: ActionStatus | undefined,
    accountId: string | undefined,
    limit: number,
  ): Promise<AdminActionRow[]> {
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
         FROM ${table}
         ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
      params,
    );
  }

  async replayAction(table: string, id: string): Promise<boolean> {
    const result: Array<{ id: string }> = await this.dataSource.query(
      `UPDATE ${table}
          SET status='pending', attempts=0, locked_until=NULL, locked_by=NULL,
              last_error=NULL, error_class=NULL, scheduled_at=now(), updated_at=now()
        WHERE id=$1 AND status IN ('dead','failed','cancelled')
        RETURNING id`,
      [id],
    );
    return result.length > 0;
  }

  async cancelAction(table: string, id: string): Promise<boolean> {
    const result: Array<{ id: string }> = await this.dataSource.query(
      `UPDATE ${table}
          SET status='cancelled', locked_until=NULL, locked_by=NULL, updated_at=now()
        WHERE id=$1 AND status IN ('pending','failed')
        RETURNING id`,
      [id],
    );
    return result.length > 0;
  }

  async archiveDead(table: string): Promise<number> {
    const rows: Array<{ archived: string }> = await this.dataSource.query(
      `WITH archived AS (
         UPDATE ${table}
            SET status='cancelled', locked_until=NULL, locked_by=NULL, updated_at=now()
          WHERE status='dead'
          RETURNING id
       )
       SELECT COUNT(*)::text AS archived FROM archived`,
    );
    return parseInt(rows[0]?.archived ?? '0', 10);
  }

  async findAccountId(table: string, id: string): Promise<string | null> {
    const rows: Array<{ account_id: string }> = await this.dataSource.query(
      `SELECT account_id FROM ${table} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0]?.account_id ?? null;
  }

  /**
   * Cancel all pending/failed actions for an account across every action
   * table. Single-sourced from ACTION_TABLE_CONFIG so new action types are
   * picked up automatically. Caller passes an EntityManager so this can run
   * inside a larger transaction (e.g. account deletion).
   */
  async cancelPendingByAccount(accountId: string, manager: EntityManager): Promise<void> {
    for (const cfg of Object.values(ACTION_TABLE_CONFIG)) {
      await manager.query(
        `UPDATE ${cfg.table} SET status = 'cancelled', updated_at = now()
          WHERE account_id = $1 AND status IN ('pending', 'failed')`,
        [accountId],
      );
    }
  }
}
