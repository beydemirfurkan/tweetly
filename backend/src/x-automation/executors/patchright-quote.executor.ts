import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XPostFlowService, isAuthRequiredError } from '@/x-automation/browser/x-post-flow.service';
import { XBrowserService } from '@/x-automation/browser/x-browser.service';
import { SelectorRegistry } from '@/x-automation/browser/selector-registry';

interface QuotePayload { text: string; targetTweetUrl: string }

@Injectable()
export class PatchrightQuoteExecutor implements IXActionExecutor<QuotePayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'quote';
  private readonly log = new Logger(PatchrightQuoteExecutor.name);

  constructor(
    private readonly registry: ExecutorRegistry,
    private readonly flow: XPostFlowService,
    private readonly browser: XBrowserService,
    private readonly sel: SelectorRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.X_EXECUTOR_MODE === 'patchright') this.registry.register(this);
  }

  async execute(action: ActionContext<QuotePayload>, session: XSession): Promise<ExecutionResult> {
    const { text, targetTweetUrl } = action.payload;
    if (!targetTweetUrl?.includes('/status/')) {
      return { ok: false, errorClass: 'permanent', message: `invalid tweet URL: ${targetTweetUrl}` };
    }

    try {
      this.log.log(`Quote execute başlıyor: ${targetTweetUrl}`);
      const result = await this.flow.execute({
        text,
        username: session.accountId,
        accountId: session.accountId,
        navigate: async (page) => {
          await page.goto(targetTweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await this.browser.assertSessionHealthy(page, session.accountId);
          await page.waitForSelector(this.sel.tweetArticle, { timeout: 15_000 });

          const retweetBtn = page.locator(this.sel.retweetOrUnretweetButton).first();
          await retweetBtn.waitFor({ timeout: 10_000 });
          await retweetBtn.click();

          const quoteItem = page.getByRole('menuitem', { name: 'Quote' });
          await quoteItem.waitFor({ timeout: 5_000 });
          await quoteItem.click();

          await page.waitForSelector(this.sel.quoteComposer, { timeout: 10_000 });
        },
        composerLabel: 'Quote composer',
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
      this.log.error(`patchright quote error: ${msg}`);
      return { ok: false, errorClass, message: msg };
    }
  }
}
