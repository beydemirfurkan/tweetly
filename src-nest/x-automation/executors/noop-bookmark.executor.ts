import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '../../domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '../../domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '../../action-engine/executor-registry.service';

interface BookmarkPayload { targetTweetUrl: string }

@Injectable()
export class NoOpBookmarkExecutor implements IXActionExecutor<BookmarkPayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'bookmark';
  private readonly log = new Logger(NoOpBookmarkExecutor.name);
  constructor(private readonly registry: ExecutorRegistry) {}

  onApplicationBootstrap(): void {
    if (process.env.X_EXECUTOR_MODE === 'noop') this.registry.register(this);
  }

  async execute(action: ActionContext<BookmarkPayload>, _session: XSession): Promise<ExecutionResult> {
    this.log.log(`[noop-bookmark] ${action.accountId}: ${action.payload.targetTweetUrl}`);
    return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
  }
}
