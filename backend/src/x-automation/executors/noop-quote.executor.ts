import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';

interface QuotePayload { text: string; targetTweetUrl: string }

@Injectable()
export class NoOpQuoteExecutor implements IXActionExecutor<QuotePayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'quote';
  private readonly log = new Logger(NoOpQuoteExecutor.name);
  constructor(private readonly registry: ExecutorRegistry) {}

  onApplicationBootstrap(): void {
    if (process.env.X_EXECUTOR_MODE === 'noop') this.registry.register(this);
  }

  async execute(action: ActionContext<QuotePayload>, _session: XSession): Promise<ExecutionResult> {
    this.log.log(`[noop-quote] ${action.accountId}: "${action.payload.text.slice(0, 40)}"`);
    const tweetId = `noop-qt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
