import { Injectable } from '@nestjs/common';
import {
  ActionQueueService,
  type ActionRow,
  type ArchivedDeadActions,
  type QueueDepth,
  type QueueLag,
} from '@/action-engine/application/action-queue.service';
import type { ActionStatus, ActionType } from '@domain/types/action.types';

@Injectable()
export class AdminApiService {
  constructor(private readonly queue: ActionQueueService) {}

  async getQueueDepth(): Promise<QueueDepth[]> {
    return this.queue.getQueueDepth();
  }

  async getQueueDepthForAccounts(accountIds: string[]): Promise<QueueDepth[]> {
    return this.queue.getQueueDepthForAccounts(accountIds);
  }

  /**
   * Age of the oldest pending action per type, in seconds. A high value
   * means the claim worker can't keep up — either workers are stuck or
   * there's an executor that always fails permanently. Per-type so an
   * isolated stall doesn't get hidden in an aggregate.
   */
  async getQueueLag(): Promise<QueueLag[]> {
    return this.queue.getQueueLag();
  }

  async getRecentSucceededCount(accountIds: string[], windowMs: number): Promise<number> {
    return this.queue.getRecentSucceededCount(accountIds, windowMs);
  }

  async listActions(
    type: ActionType,
    status?: ActionStatus,
    accountId?: string,
    limit = 50,
  ): Promise<ActionRow[]> {
    return this.queue.listActions(type, status, accountId, limit);
  }

  async replayAction(type: ActionType, id: string): Promise<boolean> {
    return this.queue.replayAction(type, id);
  }

  async cancelAction(type: ActionType, id: string): Promise<boolean> {
    return this.queue.cancelAction(type, id);
  }

  async archiveDeadActions(): Promise<ArchivedDeadActions[]> {
    return this.queue.archiveDeadActions();
  }

  async findActionAccountId(type: ActionType, id: string): Promise<string | null> {
    return this.queue.findActionAccountId(type, id);
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
    return this.queue.listDeadActions(type, limit);
  }
}
