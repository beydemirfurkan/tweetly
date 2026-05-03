import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';

interface LikePayload { targetTweetUrl: string }

@Injectable()
export class NoOpLikeExecutor implements IXActionExecutor<LikePayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'like';
  private readonly log = new Logger(NoOpLikeExecutor.name);
  constructor(private readonly registry: ExecutorRegistry) {}

  onApplicationBootstrap(): void {
    if (process.env.X_EXECUTOR_MODE === 'noop') this.registry.register(this);
  }

  async execute(action: ActionContext<LikePayload>, _session: XSession): Promise<ExecutionResult> {
    this.log.log(`[noop-like] ${action.accountId}: ${action.payload.targetTweetUrl}`);
    return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
  }
}
