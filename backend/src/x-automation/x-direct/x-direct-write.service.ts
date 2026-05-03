import { Injectable } from '@nestjs/common';
import { AccountsService } from '@/accounts/accounts.service';
import { XBrowserService } from '@/x-automation/browser/x-browser.service';
import { SelectorRegistry } from '@/x-automation/browser/selector-registry';
import { XDirectBaseService } from './x-direct-base.service';
import type { DryRunFlag } from './x-direct.types';

/**
 * Synchronous write/undo operations on the live X session: unlike, unretweet,
 * unfollow, delete, sendDm. Profile mutations live in XDirectProfileService.
 */
@Injectable()
export class XDirectWriteService extends XDirectBaseService {
  // Explicit ctor so TypeScript emits design:paramtypes for NestJS DI —
  // subclasses without their own ctor get no metadata even when decorated.
  constructor(browser: XBrowserService, sel: SelectorRegistry, accounts: AccountsService) {
    super(browser, sel, accounts);
  }

  async unlikeTweet(tweetUrl: string, accountId?: string): Promise<{ ok: boolean } & DryRunFlag> {
    if (this.isNoopMode()) {
      this.log.log(`[NoOp] unlikeTweet dry-run: ${tweetUrl}`);
      return { ok: true, dryRun: true };
    }
    return this.withSession('unlikeTweet', accountId, async (page, acctId) => {
      await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector(this.sel.tweetArticle, { timeout: 15_000 });

      const alreadyUnliked = (await page.locator(this.sel.likeButton).count()) > 0;
      if (alreadyUnliked) return { ok: true };

      const unlikeBtn = page.locator(this.sel.unlikeButton).first();
      await unlikeBtn.waitFor({ timeout: 10_000 });
      await unlikeBtn.click();
      await page.waitForSelector(this.sel.likeButton, { timeout: 5_000 });
      return { ok: true };
    });
  }

  async unretweetTweet(tweetUrl: string, accountId?: string): Promise<{ ok: boolean } & DryRunFlag> {
    if (this.isNoopMode()) {
      this.log.log(`[NoOp] unretweetTweet dry-run: ${tweetUrl}`);
      return { ok: true, dryRun: true };
    }
    return this.withSession('unretweetTweet', accountId, async (page, acctId) => {
      await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector(this.sel.tweetArticle, { timeout: 15_000 });

      const retweetBtn = page.locator(this.sel.retweetButton).first();
      await retweetBtn.waitFor({ timeout: 10_000 });
      await retweetBtn.click();

      const confirmBtn = page.locator(this.sel.unretweetConfirm).first();
      await confirmBtn.waitFor({ timeout: 5_000 });
      await confirmBtn.click();
      await page.waitForTimeout(1_500);
      return { ok: true };
    });
  }

  async unfollowAccount(targetHandle: string, accountId?: string): Promise<{ ok: boolean } & DryRunFlag> {
    if (this.isNoopMode()) {
      this.log.log(`[NoOp] unfollowAccount dry-run: @${targetHandle}`);
      return { ok: true, dryRun: true };
    }
    return this.withSession('unfollowAccount', accountId, async (page, acctId) => {
      await page.goto(`https://x.com/${targetHandle}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);

      const unfollowSel = this.sel.unfollowButton(targetHandle);
      const btn = page.locator(unfollowSel).first();
      await btn.waitFor({ timeout: 15_000 });
      await btn.click();

      const confirmBtn = page.locator(this.sel.confirmationSheetConfirm).first();
      await confirmBtn.waitFor({ timeout: 5_000 });
      await confirmBtn.click();
      await page.waitForTimeout(1_500);
      return { ok: true };
    });
  }

  async deleteTweet(tweetUrl: string, accountId?: string): Promise<{ ok: boolean } & DryRunFlag> {
    if (this.isNoopMode()) {
      this.log.log(`[NoOp] deleteTweet dry-run: ${tweetUrl}`);
      return { ok: true, dryRun: true };
    }
    return this.withSession('deleteTweet', accountId, async (page, acctId) => {
      await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector(this.sel.tweetArticle, { timeout: 15_000 });

      const caretBtn = page.locator(this.sel.moreActionsButton).first();
      await caretBtn.waitFor({ timeout: 10_000 });
      await caretBtn.click();

      const deleteBtn = page.getByRole('menuitem', { name: /delete/i }).first();
      await deleteBtn.waitFor({ timeout: 5_000 });
      await deleteBtn.click();

      const confirmBtn = page.locator(this.sel.confirmationSheetConfirm).first();
      await confirmBtn.waitFor({ timeout: 5_000 });
      await confirmBtn.click();
      await page.waitForTimeout(1_500);
      return { ok: true };
    });
  }

  async sendDm(targetHandle: string, message: string, accountId?: string): Promise<{ ok: boolean } & DryRunFlag> {
    if (this.isNoopMode()) {
      this.log.log(`[NoOp] sendDm dry-run: @${targetHandle} (${message.length} chars)`);
      return { ok: true, dryRun: true };
    }
    return this.withSession('sendDm', accountId, async (page, acctId) => {
      await page.goto(`https://x.com/${targetHandle}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);

      const dmBtn = page.locator(this.sel.dmFromProfileButton).first();
      await dmBtn.waitFor({ timeout: 15_000 });
      await dmBtn.click();

      const textarea = page.locator(this.sel.dmTextarea).first();
      await textarea.waitFor({ timeout: 10_000 });
      await textarea.fill(message);

      const sendBtn = page.locator(this.sel.dmSendButton).first();
      await sendBtn.waitFor({ timeout: 5_000 });
      await sendBtn.click();
      await page.waitForTimeout(1_500);
      return { ok: true };
    });
  }
}
