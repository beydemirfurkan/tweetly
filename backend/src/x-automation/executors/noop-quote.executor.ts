import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { BaseNoopExecutor } from './base.executor';

interface QuotePayload { text: string; targetTweetUrl: string }

@Injectable()
export class NoOpQuoteExecutor extends BaseNoopExecutor<QuotePayload> {
  readonly type: ActionType = 'quote';

  constructor(registry: ExecutorRegistry) {
    super(registry);
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
