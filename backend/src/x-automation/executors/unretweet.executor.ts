import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XDirectWriteService } from '@/x-automation/x-direct';
import { BaseDelegatingExecutor, classifyExecutionError } from './base.executor';

interface UnretweetPayload { target_tweet_url: string }

@Injectable()
export class UnretweetExecutor extends BaseDelegatingExecutor<UnretweetPayload> {
  readonly type: ActionType = 'unretweet';

  constructor(
    registry: ExecutorRegistry,
    private readonly xDirect: XDirectWriteService,
  ) {
    super(registry);
  }

  async execute(action: ActionContext<UnretweetPayload>, session: XSession): Promise<ExecutionResult> {
    try {
      await this.xDirect.unretweetTweet(action.payload.target_tweet_url, session.accountId);
      return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
    } catch (err) {
      const { errorClass, message } = classifyExecutionError(err);
      this.log.error(`unretweet error: ${message}`);
      return { ok: false, errorClass, message };
    }
  }
}
