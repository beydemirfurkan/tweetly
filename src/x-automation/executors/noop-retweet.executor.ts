import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '../../domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '../../domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '../../action-engine/executor-registry.service';

interface RetweetPayload { targetTweetUrl: string }

@Injectable()
export class NoOpRetweetExecutor implements IXActionExecutor<RetweetPayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'retweet';
  private readonly log = new Logger(NoOpRetweetExecutor.name);
  constructor(private readonly registry: ExecutorRegistry) {}

  onApplicationBootstrap(): void {
    if (process.env.X_EXECUTOR_MODE === 'noop') this.registry.register(this);
  }

  async execute(action: ActionContext<RetweetPayload>, _session: XSession): Promise<ExecutionResult> {
    this.log.log(`[noop-retweet] ${action.accountId}: ${action.payload.targetTweetUrl}`);
    return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
  }
}
