import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '../../domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '../../domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '../../action-engine/executor-registry.service';
import { XBrowserService } from '../browser/x-browser.service';
import { SelectorRegistry } from '../browser/selector-registry';
import { isAuthRequiredError } from '../browser/x-post-flow.service';

interface LikePayload { targetTweetUrl: string }

@Injectable()
export class PatchrightLikeExecutor implements IXActionExecutor<LikePayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'like';
  private readonly log = new Logger(PatchrightLikeExecutor.name);

  constructor(
    private readonly registry: ExecutorRegistry,
    private readonly browser: XBrowserService,
    private readonly sel: SelectorRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.X_EXECUTOR_MODE === 'patchright') this.registry.register(this);
  }

  async execute(action: ActionContext<LikePayload>, session: XSession): Promise<ExecutionResult> {
    const url = action.payload.targetTweetUrl;
    if (!url?.includes('/status/')) {
      return { ok: false, errorClass: 'permanent', message: `Geçersiz tweet URL: ${url}` };
    }

    const { context, page } = await this.browser.launch(session.accountId);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForSelector(this.sel.tweetArticle, { timeout: 15_000 });

      const isAlreadyLiked = (await page.locator(this.sel.unlikeButton).count()) > 0;
      if (isAlreadyLiked) {
        return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
      }

      const likeBtn = page.locator(this.sel.likeButton).first();
      await likeBtn.waitFor({ timeout: 10_000 });
      await likeBtn.click();
      await page.waitForSelector(this.sel.unlikeButton, { timeout: 5_000 });
    } catch (err) {
      await this.browser.release(context);
      const msg = err instanceof Error ? err.message : String(err);
      const errorClass = isAuthRequiredError(err) ? 'auth' : 'transient';
      this.log.error(`Patchright like hata: ${msg}`);
      return { ok: false, errorClass, message: msg };
    }

    await this.browser.release(context);
    return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
  }
}
