import { Injectable } from '@nestjs/common';
import type { ActionType, PostPayload } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XPostFlowService } from '@/x-automation/browser/x-post-flow.service';
import { BasePatchrightExecutor, classifyExecutionError } from './base.executor';

@Injectable()
export class PatchrightPostExecutor extends BasePatchrightExecutor<PostPayload> {
  readonly type: ActionType = 'post';

  constructor(
    registry: ExecutorRegistry,
    private readonly flow: XPostFlowService,
  ) {
    super(registry);
  }

  async execute(action: ActionContext<PostPayload>, session: XSession): Promise<ExecutionResult> {
    try {
      const result = await this.flow.execute({
        text: action.payload.text,
        username: session.accountId,
        accountId: session.accountId,
        mediaPath: action.payload.mediaPath ?? null,
        mediaPaths: action.payload.mediaPaths ?? null,
        altTexts: action.payload.altTexts ?? null,
        navigate: async (page) => {
          await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
        },
        composerLabel: 'Tweet composer',
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
      this.log.error(`patchright post error: ${message}`);
      return { ok: false, errorClass, message };
    }
  }
}
