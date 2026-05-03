import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XBrowserService } from '@/x-automation/browser/x-browser.service';
import { SelectorRegistry } from '@/x-automation/browser/selector-registry';
import { BasePatchrightExecutor, classifyExecutionError } from './base.executor';

interface BookmarkPayload { targetTweetUrl: string }

@Injectable()
export class PatchrightBookmarkExecutor extends BasePatchrightExecutor<BookmarkPayload> {
  readonly type: ActionType = 'bookmark';

  constructor(
    registry: ExecutorRegistry,
    private readonly browser: XBrowserService,
    private readonly sel: SelectorRegistry,
  ) {
    super(registry);
  }

  async execute(action: ActionContext<BookmarkPayload>, session: XSession): Promise<ExecutionResult> {
    const url = action.payload.targetTweetUrl;
    if (!url?.includes('/status/')) {
      return { ok: false, errorClass: 'permanent', message: `invalid tweet URL: ${url}` };
    }

    const { context, page } = await this.browser.launch(session.accountId);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, session.accountId);
      await page.waitForSelector(this.sel.tweetArticle, { timeout: 15_000 });

      const bookmarkBtn = page.locator(this.sel.bookmarkButton).first();
      await bookmarkBtn.waitFor({ timeout: 10_000 });
      await bookmarkBtn.click();
      await page.waitForTimeout(1_500);
    } catch (err) {
      const { errorClass, message } = classifyExecutionError(err);
      this.log.error(`patchright bookmark error: ${message}`);
      return { ok: false, errorClass, message };
    } finally {
      await this.browser.release(context);
    }

    return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
  }
}
