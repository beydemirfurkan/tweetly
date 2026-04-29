import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '../../domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '../../domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '../../action-engine/executor-registry.service';
import { XBrowserService } from '../browser/x-browser.service';
import { SelectorRegistry } from '../browser/selector-registry';
import { isAuthRequiredError } from '../browser/x-post-flow.service';

interface FollowPayload { targetHandle: string }

@Injectable()
export class PatchrightFollowExecutor implements IXActionExecutor<FollowPayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'follow';
  private readonly log = new Logger(PatchrightFollowExecutor.name);

  constructor(
    private readonly registry: ExecutorRegistry,
    private readonly browser: XBrowserService,
    private readonly sel: SelectorRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.X_EXECUTOR_MODE === 'patchright') this.registry.register(this);
  }

  async execute(action: ActionContext<FollowPayload>, session: XSession): Promise<ExecutionResult> {
    const { targetHandle } = action.payload;
    if (!targetHandle?.trim()) {
      return { ok: false, errorClass: 'permanent', message: 'targetHandle boş' };
    }

    const { context, page } = await this.browser.launch(session.accountId);
    try {
      await page.goto(`https://x.com/${targetHandle}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, session.accountId);

      const followSel = this.sel.followButton(targetHandle);
      const followBtn = page.locator(followSel).first();
      await followBtn.waitFor({ timeout: 15_000 });
      await followBtn.click();
      await page.waitForTimeout(2_000);
    } catch (err) {
      await this.browser.release(context);
      const msg = err instanceof Error ? err.message : String(err);
      const errorClass = isAuthRequiredError(err) ? 'auth' : 'transient';
      this.log.error(`Patchright follow hata (${targetHandle}): ${msg}`);
      return { ok: false, errorClass, message: msg };
    }

    await this.browser.release(context);
    return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
  }
}
