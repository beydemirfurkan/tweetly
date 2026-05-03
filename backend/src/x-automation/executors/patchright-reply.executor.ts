import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '../../domain/types/action.types';
import type {
  ActionContext,
  ExecutionResult,
  IXActionExecutor,
  XSession,
} from '../../domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '../../action-engine/executor-registry.service';
import { XPostFlowService, isAuthRequiredError } from '../browser/x-post-flow.service';
import { SelectorRegistry } from '../browser/selector-registry';

interface ReplyPayload {
  text: string;
  parentTweetUrl: string;
}

@Injectable()
export class PatchrightReplyExecutor
  implements IXActionExecutor<ReplyPayload>, OnApplicationBootstrap
{
  readonly type: ActionType = 'reply';
  private readonly log = new Logger(PatchrightReplyExecutor.name);

  constructor(
    private readonly registry: ExecutorRegistry,
    private readonly flow: XPostFlowService,
    private readonly sel: SelectorRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.X_EXECUTOR_MODE === 'patchright') {
      this.registry.register(this);
    }
  }

  async execute(action: ActionContext<ReplyPayload>, session: XSession): Promise<ExecutionResult> {
    if (!action.payload.parentTweetUrl?.includes('/status/')) {
      return {
        ok: false,
        errorClass: 'permanent',
        message: `invalid parent URL: ${action.payload.parentTweetUrl}`,
      };
    }
    try {
      const result = await this.flow.execute({
        text: action.payload.text,
        username: session.accountId,
        accountId: session.accountId,
        navigate: async (page) => {
          await page.goto(action.payload.parentTweetUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await page.waitForSelector(this.sel.tweetArticle, { timeout: 15000 });
        },
        composerLabel: 'Reply composer',
      });
      return {
        ok: true,
        result: {
          kind: 'tweet',
          tweetId: result.tweetId,
          tweetUrl: result.tweetUrl,
          sentAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errorClass = isAuthRequiredError(err) ? 'auth' : 'transient';
      this.log.error(`patchright reply error: ${msg}`);
      return { ok: false, errorClass, message: msg };
    }
  }
}
