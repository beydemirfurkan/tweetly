import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '../../domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '../../domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '../../action-engine/executor-registry.service';
import { XBrowserService } from '../browser/x-browser.service';
import { SelectorRegistry } from '../browser/selector-registry';
import { isAuthRequiredError } from '../browser/x-post-flow.service';

interface BookmarkPayload { targetTweetUrl: string }

@Injectable()
export class PatchrightBookmarkExecutor implements IXActionExecutor<BookmarkPayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'bookmark';
  private readonly log = new Logger(PatchrightBookmarkExecutor.name);

  constructor(
    private readonly registry: ExecutorRegistry,
    private readonly browser: XBrowserService,
    private readonly sel: SelectorRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.X_EXECUTOR_MODE === 'patchright') this.registry.register(this);
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
      await this.browser.release(context);
      const msg = err instanceof Error ? err.message : String(err);
      const errorClass = isAuthRequiredError(err) ? 'auth' : 'transient';
      this.log.error(`patchright bookmark error: ${msg}`);
      return { ok: false, errorClass, message: msg };
    }

    await this.browser.release(context);
    return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
  }
}
