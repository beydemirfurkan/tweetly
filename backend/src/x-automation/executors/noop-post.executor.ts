import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { BaseNoopExecutor } from './base.executor';

interface PostPayload {
  text: string;
  mediaPath?: string | null;
  mediaPaths?: string[] | null;
  altTexts?: string[] | null;
}

/**
 * Dev/noop fallback executor. Active when X_EXECUTOR_MODE === 'noop'.
 * Does not post; returns a synthetic tweet id so the action engine end-to-end
 * flow and idempotency behavior can be exercised without a browser.
 */
@Injectable()
export class NoOpPostExecutor extends BaseNoopExecutor<PostPayload> {
  readonly type: ActionType = 'post';

  constructor(registry: ExecutorRegistry) {
    super(registry);
  }

  async execute(action: ActionContext<PostPayload>, _session: XSession): Promise<ExecutionResult> {
    const mediaCount =
      (action.payload.mediaPaths?.length ?? 0) || (action.payload.mediaPath ? 1 : 0);
    const altCount = action.payload.altTexts?.filter((t) => t && t.trim()).length ?? 0;
    this.log.log(
      `[noop-post] ${action.accountId}: "${action.payload.text.slice(0, 40)}..." ` +
        `media=${mediaCount} altTexts=${altCount}`,
    );
    const tweetId = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
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
