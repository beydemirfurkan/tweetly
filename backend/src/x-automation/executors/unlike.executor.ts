import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XDirectWriteService } from '@/x-automation/x-direct';
import { BaseDelegatingExecutor, classifyExecutionError } from './base.executor';

interface UnlikePayload { target_tweet_url: string }

@Injectable()
export class UnlikeExecutor extends BaseDelegatingExecutor<UnlikePayload> {
  readonly type: ActionType = 'unlike';

  constructor(
    registry: ExecutorRegistry,
    private readonly xDirect: XDirectWriteService,
  ) {
    super(registry);
  }

  async execute(action: ActionContext<UnlikePayload>, session: XSession): Promise<ExecutionResult> {
    try {
      await this.xDirect.unlikeTweet(action.payload.target_tweet_url, session.accountId);
      return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
    } catch (err) {
      const { errorClass, message } = classifyExecutionError(err);
      this.log.error(`unlike error: ${message}`);
      return { ok: false, errorClass, message };
    }
  }
}
