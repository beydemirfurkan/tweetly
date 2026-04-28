import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '../../domain/types/action.types';
import type {
  ActionContext,
  ExecutionResult,
  IXActionExecutor,
  XSession,
} from '../../domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '../../action-engine/executor-registry.service';

interface ReplyPayload {
  text: string;
  parentTweetUrl: string;
}

@Injectable()
export class NoOpReplyExecutor implements IXActionExecutor<ReplyPayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'reply';
  private readonly log = new Logger(NoOpReplyExecutor.name);

  constructor(private readonly registry: ExecutorRegistry) {}

  onApplicationBootstrap(): void {
    if (process.env.X_EXECUTOR_MODE === 'noop') {
      this.registry.register(this);
    }
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
