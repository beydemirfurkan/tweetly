import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XBrowserService } from '@/x-automation/browser/x-browser.service';
import { SelectorRegistry } from '@/x-automation/browser/selector-registry';
import { BasePatchrightExecutor, classifyExecutionError } from './base.executor';

interface LikePayload { targetTweetUrl: string }

@Injectable()
export class PatchrightLikeExecutor extends BasePatchrightExecutor<LikePayload> {
  readonly type: ActionType = 'like';

  constructor(
    registry: ExecutorRegistry,
    private readonly browser: XBrowserService,
    private readonly sel: SelectorRegistry,
  ) {
    super(registry);
  }

  async execute(action: ActionContext<LikePayload>, session: XSession): Promise<ExecutionResult> {
    const url = action.payload.targetTweetUrl;
    if (!url?.includes('/status/')) {
      return { ok: false, errorClass: 'permanent', message: `invalid tweet URL: ${url}` };
    }

    const { context, page } = await this.browser.launch(session.accountId);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, session.accountId);
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
      const { errorClass, message } = classifyExecutionError(err);
      this.log.error(`patchright like error: ${message}`);
      return { ok: false, errorClass, message };
    } finally {
      await this.browser.release(context);
    }

    return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
  }
}
