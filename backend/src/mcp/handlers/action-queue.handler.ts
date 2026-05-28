import { Injectable } from '@nestjs/common';
import { ActionQueueService } from '@/action-engine/application/action-queue.service';
import type { ActionType, ActionStatus } from '@domain/types/action.types';
import { ACTION_TYPES, ACTION_STATUSES } from '@domain/types/action.types';
import { BaseMcpHandler } from './base.handler';
import type { McpToolArgs, McpToolContext } from './mcp-tool.context';

/**
 * Read / mutate the action queue: list rows scoped to the caller's owned
 * accounts, cancel pending/failed actions, replay dead/failed ones.
 * Ownership is enforced via the context helpers — this handler never
 * touches AccountsService directly.
 */
@Injectable()
export class ActionQueueHandler extends BaseMcpHandler {
  constructor(private readonly queue: ActionQueueService) {
    super();
  }

  async listActions(args: McpToolArgs, ctx: McpToolContext) {
    const type = args.type as ActionType;
    if (!ACTION_TYPES.includes(type)) throw new Error(`type must be one of: ${ACTION_TYPES.join(', ')}`);
    const limit = Math.min(Math.max(1, Number(args.limit ?? 50)), 200);
    const rawStatus = args.status as string | undefined;
    const status = rawStatus && ACTION_STATUSES.includes(rawStatus as ActionStatus)
      ? (rawStatus as ActionStatus)
      : undefined;
    const allowedIds = await ctx.userAccountIdSet();
    if (allowedIds.size === 0) return { type, count: 0, rows: [] };

    const argAccountId = args.account_id as string | undefined;
    if (argAccountId && !allowedIds.has(argAccountId)) {
      throw new Error(`Account ${argAccountId} not found`);
    }
    const rows = await this.queue.listActions(type, status, argAccountId, limit);
    const filtered = argAccountId ? rows : rows.filter((r) => allowedIds.has(r.account_id));
    return { type, count: filtered.length, rows: filtered };
  }

  async cancelAction(args: McpToolArgs, ctx: McpToolContext) {
    const type = args.type as ActionType;
    const id = args.action_id as string;
    if (!ACTION_TYPES.includes(type)) throw new Error(`Unknown action type: ${type}`);
    await ctx.assertActionOwnership(type, id);
    const ok = await this.queue.cancelAction(type, id);
    if (!ok) throw new Error(`Action ${id} not found or not cancellable`);
    return { ok: true, id, status: 'cancelled' };
  }

  async replayAction(args: McpToolArgs, ctx: McpToolContext) {
    const type = args.type as ActionType;
    const id = args.action_id as string;
    if (!ACTION_TYPES.includes(type)) throw new Error(`Unknown action type: ${type}`);
    await ctx.assertActionOwnership(type, id);
    const ok = await this.queue.replayAction(type, id);
    if (!ok) throw new Error(`Action ${id} not found or not replayable`);
    return { ok: true, id, status: 'pending' };
  }
}
