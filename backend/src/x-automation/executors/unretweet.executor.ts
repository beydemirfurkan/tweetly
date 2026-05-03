import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XDirectService } from '@/x-automation/x-direct.service';
import { isAuthRequiredError } from '@/x-automation/browser/x-post-flow.service';

interface UnretweetPayload { target_tweet_url: string }

@Injectable()
export class UnretweetExecutor implements IXActionExecutor<UnretweetPayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'unretweet';
  private readonly log = new Logger(UnretweetExecutor.name);

  constructor(
    private readonly registry: ExecutorRegistry,
    private readonly xDirect: XDirectService,
  ) {}

  onApplicationBootstrap(): void {
    this.registry.register(this);
  }

  async execute(action: ActionContext<UnretweetPayload>, session: XSession): Promise<ExecutionResult> {
    try {
      await this.xDirect.unretweetTweet(action.payload.target_tweet_url, session.accountId);
      return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errorClass = isAuthRequiredError(err) ? 'auth' : 'transient';
      this.log.error(`unretweet error: ${msg}`);
      return { ok: false, errorClass, message: msg };
    }
  }
}
