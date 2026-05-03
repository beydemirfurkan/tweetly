import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type {
  ActionContext,
  ExecutionResult,
  IXActionExecutor,
  XSession,
} from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XPostFlowService, isAuthRequiredError } from '@/x-automation/browser/x-post-flow.service';

interface PostPayload {
  text: string;
  mediaPath?: string | null;
  mediaPaths?: string[] | null;
  altTexts?: string[] | null;
}

@Injectable()
export class PatchrightPostExecutor
  implements IXActionExecutor<PostPayload>, OnApplicationBootstrap
{
  readonly type: ActionType = 'post';
  private readonly log = new Logger(PatchrightPostExecutor.name);

  constructor(
    private readonly registry: ExecutorRegistry,
    private readonly flow: XPostFlowService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.X_EXECUTOR_MODE === 'patchright') {
      this.registry.register(this);
    }
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
      const msg = err instanceof Error ? err.message : String(err);
      const errorClass = isAuthRequiredError(err) ? 'auth' : 'transient';
      this.log.error(`patchright post error: ${msg}`);
      return { ok: false, errorClass, message: msg };
    }
  }
}
