import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XBrowserService } from '@/x-automation/browser/x-browser.service';
import { SelectorRegistry } from '@/x-automation/browser/selector-registry';
import { BasePatchrightExecutor, classifyExecutionError } from './base.executor';

interface FollowPayload { targetHandle: string }

@Injectable()
export class PatchrightFollowExecutor extends BasePatchrightExecutor<FollowPayload> {
  readonly type: ActionType = 'follow';

  constructor(
    registry: ExecutorRegistry,
    private readonly browser: XBrowserService,
    private readonly sel: SelectorRegistry,
  ) {
    super(registry);
  }

  async execute(action: ActionContext<FollowPayload>, session: XSession): Promise<ExecutionResult> {
    const { targetHandle } = action.payload;
    if (!targetHandle?.trim()) {
      return { ok: false, errorClass: 'permanent', message: 'targetHandle is empty' };
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
      const { errorClass, message } = classifyExecutionError(err);
      this.log.error(`patchright follow error (${targetHandle}): ${message}`);
      return { ok: false, errorClass, message };
    } finally {
      await this.browser.release(context);
    }

    return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
  }
}
