import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '../../domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '../../domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '../../action-engine/executor-registry.service';

interface FollowPayload { targetHandle: string }

@Injectable()
export class NoOpFollowExecutor implements IXActionExecutor<FollowPayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'follow';
  private readonly log = new Logger(NoOpFollowExecutor.name);
  constructor(private readonly registry: ExecutorRegistry) {}

  onApplicationBootstrap(): void {
    if (process.env.X_EXECUTOR_MODE === 'noop') this.registry.register(this);
  }

  async execute(action: ActionContext<FollowPayload>, _session: XSession): Promise<ExecutionResult> {
    this.log.log(`[noop-follow] ${action.accountId}: @${action.payload.targetHandle}`);
    return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
  }
}
