import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '../../domain/types/action.types';
import type {
  ActionContext,
  ExecutionResult,
  IXActionExecutor,
  XSession,
} from '../../domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '../../action-engine/executor-registry.service';

interface PostPayload {
  text: string;
  mediaPath?: string | null;
}

/**
 * Faz 2 placeholder. Faz 3'te PatchrightPostExecutor ile değiştirilecek.
 * Gerçek post yapmaz; sentetik tweet id üretir, sadece engine'in end-to-end
 * akışını ve idempotency davranışını doğrulamak için.
 */
@Injectable()
export class NoOpPostExecutor implements IXActionExecutor<PostPayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'post';
  private readonly log = new Logger(NoOpPostExecutor.name);

  constructor(private readonly registry: ExecutorRegistry) {}

  onApplicationBootstrap(): void {
    if (process.env.X_EXECUTOR_MODE === 'noop') {
      this.registry.register(this);
    }
  }

  async execute(action: ActionContext<PostPayload>, _session: XSession): Promise<ExecutionResult> {
    this.log.log(`[noop-post] ${action.accountId}: "${action.payload.text.slice(0, 40)}..."`);
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
