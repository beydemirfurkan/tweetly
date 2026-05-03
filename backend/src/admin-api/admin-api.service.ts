import { Injectable } from '@nestjs/common';
import type { ActionStatus, ActionType } from '@domain/types/action.types';
import { ACTION_TABLE_CONFIG } from '@persistence/repositories/action-repository';
import {
  ActionAdminRepository,
  type AdminActionRow,
} from '@persistence/repositories/action-admin.repository';

export interface QueueDepth {
  type: ActionType;
  pending: number;
  claimed: number;
  running: number;
  failed: number;
  dead: number;
}

export type ActionRow = AdminActionRow;

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
  constructor(private readonly repo: ActionAdminRepository) {}

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
    for (const [type, cfg] of typedTableEntries()) {
      const counts = await this.repo.statusCounts(cfg.table, accountIds);
      results.push({ type, ...counts });
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
    for (const [type, cfg] of typedTableEntries()) {
      const oldestPendingSeconds = await this.repo.oldestPendingSeconds(cfg.table);
      results.push({ type, oldestPendingSeconds });
    }
    return results;
  }

  async getRecentSucceededCount(accountIds: string[], windowMs: number): Promise<number> {
    if (accountIds.length === 0) return 0;
    const since = new Date(Date.now() - windowMs);
    let total = 0;
    for (const cfg of Object.values(ACTION_TABLE_CONFIG)) {
      total += await this.repo.countSucceededSince(cfg.table, accountIds, since);
    }
    return total;
  }

  async listActions(
    type: ActionType,
    status?: ActionStatus,
    accountId?: string,
    limit = 50,
  ): Promise<ActionRow[]> {
    return this.repo.listActions(ACTION_TABLE_CONFIG[type].table, status, accountId, limit);
  }

  async replayAction(type: ActionType, id: string): Promise<boolean> {
    return this.repo.replayAction(ACTION_TABLE_CONFIG[type].table, id);
  }

  async cancelAction(type: ActionType, id: string): Promise<boolean> {
    return this.repo.cancelAction(ACTION_TABLE_CONFIG[type].table, id);
  }

  async archiveDeadActions(): Promise<ArchivedDeadActions[]> {
    const results: ArchivedDeadActions[] = [];
    for (const [type, cfg] of typedTableEntries()) {
      const archived = await this.repo.archiveDead(cfg.table);
      results.push({ type, archived });
    }
    return results;
  }

  async findActionAccountId(type: ActionType, id: string): Promise<string | null> {
    return this.repo.findAccountId(ACTION_TABLE_CONFIG[type].table, id);
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

function typedTableEntries(): Array<[ActionType, typeof ACTION_TABLE_CONFIG[ActionType]]> {
  return Object.entries(ACTION_TABLE_CONFIG) as Array<[ActionType, typeof ACTION_TABLE_CONFIG[ActionType]]>;
}
