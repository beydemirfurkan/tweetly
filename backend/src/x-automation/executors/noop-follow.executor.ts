import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { BaseNoopExecutor } from './base.executor';

interface FollowPayload { targetHandle: string }

@Injectable()
export class NoOpFollowExecutor extends BaseNoopExecutor<FollowPayload> {
  readonly type: ActionType = 'follow';

  constructor(registry: ExecutorRegistry) {
    super(registry);
  }

  async execute(action: ActionContext<FollowPayload>, _session: XSession): Promise<ExecutionResult> {
    this.log.log(`[noop-follow] ${action.accountId}: @${action.payload.targetHandle}`);
    return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
  }
}
