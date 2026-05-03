import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XPostFlowService } from '@/x-automation/browser/x-post-flow.service';
import { SelectorRegistry } from '@/x-automation/browser/selector-registry';
import { BasePatchrightExecutor, classifyExecutionError } from './base.executor';

interface ReplyPayload {
  text: string;
  parentTweetUrl: string;
}

@Injectable()
export class PatchrightReplyExecutor extends BasePatchrightExecutor<ReplyPayload> {
  readonly type: ActionType = 'reply';

  constructor(
    registry: ExecutorRegistry,
    private readonly flow: XPostFlowService,
    private readonly sel: SelectorRegistry,
  ) {
    super(registry);
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
      const { errorClass, message } = classifyExecutionError(err);
      this.log.error(`patchright reply error: ${message}`);
      return { ok: false, errorClass, message };
    }
  }
}
