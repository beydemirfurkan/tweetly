import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '../../domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '../../domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '../../action-engine/executor-registry.service';
import { XBrowserService } from '../browser/x-browser.service';
import { SelectorRegistry } from '../browser/selector-registry';
import { isAuthRequiredError } from '../browser/x-post-flow.service';

interface RetweetPayload { targetTweetUrl: string }

@Injectable()
export class PatchrightRetweetExecutor implements IXActionExecutor<RetweetPayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'retweet';
  private readonly log = new Logger(PatchrightRetweetExecutor.name);

  constructor(
    private readonly registry: ExecutorRegistry,
    private readonly browser: XBrowserService,
    private readonly sel: SelectorRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.X_EXECUTOR_MODE === 'patchright') this.registry.register(this);
  }

  async execute(action: ActionContext<RetweetPayload>, session: XSession): Promise<ExecutionResult> {
    const url = action.payload.targetTweetUrl;
    if (!url?.includes('/status/')) {
      return { ok: false, errorClass: 'permanent', message: `Geçersiz tweet URL: ${url}` };
    }

    const { context, page } = await this.browser.launch(session.accountId);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForSelector(this.sel.tweetArticle, { timeout: 15_000 });

      const retweetBtn = page.locator(this.sel.retweetButton).first();
      await retweetBtn.waitFor({ timeout: 10_000 });
      await retweetBtn.click();

      const confirmBtn = page.locator(this.sel.retweetConfirm);
      await confirmBtn.waitFor({ timeout: 5_000 });
      await confirmBtn.click();
      await page.waitForTimeout(1_500);
    } catch (err) {
      await this.browser.release(context);
      const msg = err instanceof Error ? err.message : String(err);
      const errorClass = isAuthRequiredError(err) ? 'auth' : 'transient';
      this.log.error(`Patchright retweet hata: ${msg}`);
      return { ok: false, errorClass, message: msg };
    }

    await this.browser.release(context);
    return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
  }
}
