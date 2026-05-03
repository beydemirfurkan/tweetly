import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { BaseNoopExecutor } from './base.executor';

interface RetweetPayload { targetTweetUrl: string }

@Injectable()
export class NoOpRetweetExecutor extends BaseNoopExecutor<RetweetPayload> {
  readonly type: ActionType = 'retweet';

  constructor(registry: ExecutorRegistry) {
    super(registry);
  }

  async execute(action: ActionContext<RetweetPayload>, _session: XSession): Promise<ExecutionResult> {
    this.log.log(`[noop-retweet] ${action.accountId}: ${action.payload.targetTweetUrl}`);
    return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
  }
}
