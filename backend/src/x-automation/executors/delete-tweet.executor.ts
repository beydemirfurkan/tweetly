import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XDirectService } from '@/x-automation/x-direct.service';
import { BaseDelegatingExecutor, classifyExecutionError } from './base.executor';

interface DeleteTweetPayload { target_tweet_url: string }

@Injectable()
export class DeleteTweetExecutor extends BaseDelegatingExecutor<DeleteTweetPayload> {
  readonly type: ActionType = 'delete_tweet';

  constructor(
    registry: ExecutorRegistry,
    private readonly xDirect: XDirectService,
  ) {
    super(registry);
  }

  async execute(action: ActionContext<DeleteTweetPayload>, session: XSession): Promise<ExecutionResult> {
    try {
      await this.xDirect.deleteTweet(action.payload.target_tweet_url, session.accountId);
      return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
    } catch (err) {
      const { errorClass, message } = classifyExecutionError(err);
      this.log.error(`delete_tweet error: ${message}`);
      return { ok: false, errorClass, message };
    }
  }
}
