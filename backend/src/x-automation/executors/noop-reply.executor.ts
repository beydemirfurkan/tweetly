import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { BaseNoopExecutor } from './base.executor';

interface ReplyPayload {
  text: string;
  parentTweetUrl: string;
}

@Injectable()
export class NoOpReplyExecutor extends BaseNoopExecutor<ReplyPayload> {
  readonly type: ActionType = 'reply';

  constructor(registry: ExecutorRegistry) {
    super(registry);
  }

  async execute(action: ActionContext<ReplyPayload>, _session: XSession): Promise<ExecutionResult> {
    this.log.log(`[noop-reply] ${action.accountId} → ${action.payload.parentTweetUrl}`);
    const tweetId = `noop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      ok: true,
      result: {
        kind: 'tweet',
        tweetId,
        tweetUrl: `https://x.com/${action.accountId}/status/${tweetId}`,
        sentAt: new Date().toISOString(),
      },
    };
  }
}
