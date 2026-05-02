import * as fs from 'fs';
import { Injectable, Logger } from '@nestjs/common';
import type { Page } from 'patchright';
import { XBrowserService } from './browser/x-browser.service';
import { SelectorRegistry } from './browser/selector-registry';
import { AccountsService } from '../accounts/accounts.service';
import { isAuthRequiredError } from './browser/x-post-flow.service';

export interface TweetResult {
  url: string;
  text: string;
  handle: string;
  displayName: string;
  likeCount: string;
  retweetCount: string;
  replyCount: string;
  postedAt: string;
}

export interface UserResult {
  handle: string;
  displayName: string;
  bio: string;
  followersCount: string;
  followingCount: string;
  tweetsCount: string;
  verified: boolean;
  profileUrl: string;
  profileImageUrl: string;
}

@Injectable()
export class XDirectService {
  private readonly log = new Logger(XDirectService.name);

  constructor(
    private readonly browser: XBrowserService,
    private readonly sel: SelectorRegistry,
    private readonly accounts: AccountsService,
  ) {}

  private async resolveAccountId(accountId?: string): Promise<string> {
    if (accountId) return accountId;
    const all = await this.accounts.listActive();
    if (all.length === 0) throw new Error('No active accounts configured');
    return all[0].id;
  }

  private isNoopMode(): boolean {
    return (process.env.X_EXECUTOR_MODE ?? 'noop') !== 'patchright';
  }

  // ── Write Operations ──────────────────────────────────────────────────────

  async unlikeTweet(tweetUrl: string, accountId?: string): Promise<{ ok: boolean; dryRun?: boolean }> {
    if (this.isNoopMode()) {
      this.log.log(`[NoOp] unlikeTweet dry-run: ${tweetUrl}`);
      return { ok: true, dryRun: true };
    }
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    try {
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
    } catch (err) {
      this.log.error(`unlikeTweet error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  async unretweetTweet(tweetUrl: string, accountId?: string): Promise<{ ok: boolean; dryRun?: boolean }> {
    if (this.isNoopMode()) {
      this.log.log(`[NoOp] unretweetTweet dry-run: ${tweetUrl}`);
      return { ok: true, dryRun: true };
    }
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    try {
      await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector(this.sel.tweetArticle, { timeout: 15_000 });

      // retweetButton when already retweeted has different styling but same testid
      const retweetBtn = page.locator(this.sel.retweetButton).first();
      await retweetBtn.waitFor({ timeout: 10_000 });
      await retweetBtn.click();

      const confirmBtn = page.locator(this.sel.unretweetConfirm).first();
      await confirmBtn.waitFor({ timeout: 5_000 });
      await confirmBtn.click();
      await page.waitForTimeout(1_500);
      return { ok: true };
    } catch (err) {
      this.log.error(`unretweetTweet error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  async unfollowAccount(targetHandle: string, accountId?: string): Promise<{ ok: boolean; dryRun?: boolean }> {
    if (this.isNoopMode()) {
      this.log.log(`[NoOp] unfollowAccount dry-run: @${targetHandle}`);
      return { ok: true, dryRun: true };
    }
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    try {
      await page.goto(`https://x.com/${targetHandle}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);

      const unfollowSel = this.sel.unfollowButton(targetHandle);
      const btn = page.locator(unfollowSel).first();
      await btn.waitFor({ timeout: 15_000 });
      await btn.click();

      // Confirm unfollow in the dialog
      const confirmBtn = page.locator('[data-testid="confirmationSheetConfirm"]').first();
      await confirmBtn.waitFor({ timeout: 5_000 });
      await confirmBtn.click();
      await page.waitForTimeout(1_500);
      return { ok: true };
    } catch (err) {
      this.log.error(`unfollowAccount error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  async deleteTweet(tweetUrl: string, accountId?: string): Promise<{ ok: boolean; dryRun?: boolean }> {
    if (this.isNoopMode()) {
      this.log.log(`[NoOp] deleteTweet dry-run: ${tweetUrl}`);
      return { ok: true, dryRun: true };
    }
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    try {
      await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector(this.sel.tweetArticle, { timeout: 15_000 });

      const caretBtn = page.locator(this.sel.moreActionsButton).first();
      await caretBtn.waitFor({ timeout: 10_000 });
      await caretBtn.click();

      // Click delete option in dropdown
      const deleteBtn = page.getByRole('menuitem', { name: /delete/i }).first();
      await deleteBtn.waitFor({ timeout: 5_000 });
      await deleteBtn.click();

      // Confirm delete
      const confirmBtn = page.locator('[data-testid="confirmationSheetConfirm"]').first();
      await confirmBtn.waitFor({ timeout: 5_000 });
      await confirmBtn.click();
      await page.waitForTimeout(1_500);
      return { ok: true };
    } catch (err) {
      this.log.error(`deleteTweet error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  async sendDm(targetHandle: string, message: string, accountId?: string): Promise<{ ok: boolean; dryRun?: boolean }> {
    if (this.isNoopMode()) {
      this.log.log(`[NoOp] sendDm dry-run: @${targetHandle} (${message.length} chars)`);
      return { ok: true, dryRun: true };
    }
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    try {
      // Navigate to DM compose via profile page
      await page.goto(`https://x.com/${targetHandle}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);

      const dmBtn = page.locator('[data-testid="sendDMFromProfile"]').first();
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
    } catch (err) {
      this.log.error(`sendDm error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  async updateProfile(fields: {
    name?: string;
    bio?: string;
    location?: string;
    website?: string;
  }, accountId?: string): Promise<{ ok: boolean; updated: string[]; dryRun?: boolean }> {
    if (this.isNoopMode()) {
      const updated = Object.keys(fields).filter((k) => fields[k as keyof typeof fields] !== undefined);
      this.log.log(`[NoOp] updateProfile dry-run: ${JSON.stringify(updated)}`);
      return { ok: true, updated, dryRun: true };
    }
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    const updated: string[] = [];
    try {
      await page.goto('https://x.com/settings/profile', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForTimeout(2_000);

      if (fields.name !== undefined) {
        const nameInput = page.locator('input[name="displayName"]').first();
        await nameInput.waitFor({ timeout: 10_000 });
        await nameInput.fill(fields.name);
        updated.push('name');
      }

      if (fields.bio !== undefined) {
        const bioInput = page.locator('textarea[name="description"]').first();
        await bioInput.waitFor({ timeout: 5_000 });
        await bioInput.fill(fields.bio);
        updated.push('bio');
      }

      if (fields.location !== undefined) {
        const locInput = page.locator('input[name="location"]').first();
        await locInput.waitFor({ timeout: 5_000 });
        await locInput.fill(fields.location);
        updated.push('location');
      }

      if (fields.website !== undefined) {
        const webInput = page.locator('input[name="url"]').first();
        await webInput.waitFor({ timeout: 5_000 });
        await webInput.fill(fields.website);
        updated.push('website');
      }

      if (updated.length > 0) {
        const saveBtn = page.getByRole('button', { name: /save/i }).first();
        await saveBtn.waitFor({ timeout: 5_000 });
        await saveBtn.click();
        await page.waitForTimeout(2_000);
      }

      return { ok: true, updated };
    } catch (err) {
      this.log.error(`updateProfile error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  async updateAvatar(filePath: string, accountId?: string): Promise<{ ok: boolean; dryRun?: boolean }> {
    return this.uploadProfileImage('avatar', filePath, accountId);
  }

  async updateBanner(filePath: string, accountId?: string): Promise<{ ok: boolean; dryRun?: boolean }> {
    return this.uploadProfileImage('banner', filePath, accountId);
  }

  private async uploadProfileImage(
    kind: 'avatar' | 'banner',
    filePath: string,
    accountId?: string,
  ): Promise<{ ok: boolean; dryRun?: boolean }> {
    if (this.isNoopMode()) {
      this.log.log(`[NoOp] update${kind === 'avatar' ? 'Avatar' : 'Banner'} dry-run: ${filePath}`);
      return { ok: true, dryRun: true };
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`${kind} file not found: ${filePath}`);
    }
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    try {
      await page.goto('https://x.com/settings/profile', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForTimeout(2_000);

      // X exposes both file inputs side-by-side on the profile editor. We pick
      // by index (avatar = 0, banner = 1) and fall back to the first available
      // input if only one is present in the DOM.
      const fileInputs = page.locator(this.sel.profileFileInputs);
      const count = await fileInputs.count().catch(() => 0);
      if (count === 0) {
        throw new Error('No profile-image file inputs found on /settings/profile (UI may have changed)');
      }
      const target = kind === 'avatar' ? fileInputs.first() : (count > 1 ? fileInputs.nth(1) : fileInputs.first());
      await target.setInputFiles(filePath);

      // Crop modal Apply (X often shows a crop UI for both avatar and banner).
      const apply = page.locator(this.sel.profileApplyButton).first();
      try {
        await apply.waitFor({ timeout: 8_000 });
        await apply.click();
      } catch {
        // No crop modal — some uploads commit immediately. Continue to Save.
      }

      const saveBtn = page.locator(this.sel.profileSaveButton).first();
      try {
        await saveBtn.waitFor({ timeout: 5_000 });
        await saveBtn.click();
      } catch {
        // Some flows persist immediately without a Save button.
      }
      await page.waitForTimeout(2_000);
      return { ok: true };
    } catch (err) {
      this.log.error(`update${kind === 'avatar' ? 'Avatar' : 'Banner'} error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  // ── Read Operations ───────────────────────────────────────────────────────

  async searchTweets(query: string, limit = 20, accountId?: string): Promise<TweetResult[]> {
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    try {
      const encoded = encodeURIComponent(query);
      await page.goto(`https://x.com/search?q=${encoded}&f=live`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector(this.sel.tweetArticle, { timeout: 20_000 });
      await page.waitForTimeout(2_000);

      return await this.extractTweets(page, limit);
    } catch (err) {
      this.log.error(`searchTweets error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  async getUser(handle: string, accountId?: string): Promise<UserResult> {
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    try {
      await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(5_000);

      return await page.evaluate((params) => {
        const nameEl = document.querySelector(params.userName);
        const bioEl = document.querySelector(params.userDescription);
        const followersEl = document.querySelector(params.userFollowersCount);
        const followingEl = document.querySelector(params.userFollowingCount);
        const verifiedEl = document.querySelector('svg[data-testid="icon-verified"]');
        const avatarEl = document.querySelector(params.userProfileImage) as HTMLImageElement | null;

        const fullName = nameEl?.querySelector('span')?.textContent ?? '';
        const handleEl = nameEl?.querySelectorAll('span')?.[1];
        const rawHandle = handleEl?.textContent?.replace('@', '') ?? params.handle;

        let tweetsCount = '';
        const profileHandle = `/${rawHandle}`;
        const allStatLinks = document.querySelectorAll(`a[href="${profileHandle}"], a[href="${profileHandle}/"]`);
        for (const link of allStatLinks) {
          const text = link.textContent ?? '';
          if (text.match(/gönderi|posts/i)) {
            const numMatch = text.match(/([\d.,]+\s*[KkMmBb]?)/);
            if (numMatch) {
              tweetsCount = numMatch[1].trim();
              break;
            }
          }
        }

        if (!tweetsCount) {
          const navLinks = document.querySelectorAll('nav a[href], [role="tablist"] a[href], [role="tab"]');
          for (const link of navLinks) {
            const href = link.getAttribute('href') ?? '';
            if (href.includes('/followers') || href.includes('/following') || href.includes('/verified_followers')) continue;
            const text = link.textContent ?? '';
            if (text.match(/gönderi|posts/i)) {
              const numMatch = text.match(/([\d.,]+\s*[KkMmBb]?)/);
              if (numMatch) {
                tweetsCount = numMatch[1].trim();
                break;
              }
            }
          }
        }

        if (!tweetsCount) {
          const allLinks = document.querySelectorAll('a[href]');
          for (const link of allLinks) {
            const href = link.getAttribute('href') ?? '';
            if (href !== profileHandle && href !== profileHandle + '/') continue;
            const text = link.textContent ?? '';
            const numMatch = text.match(/([\d.,]+\s*[KkMmBb]?)/);
            if (numMatch) {
              tweetsCount = numMatch[1].trim();
              break;
            }
          }
        }

        const profileImageUrl = avatarEl?.src ?? '';

        return {
          handle: rawHandle,
          displayName: fullName,
          bio: bioEl?.textContent ?? '',
          followersCount: followersEl?.textContent ?? '0',
          followingCount: followingEl?.textContent ?? '0',
          tweetsCount: tweetsCount || '0',
          verified: Boolean(verifiedEl),
          profileUrl: `https://x.com/${rawHandle}`,
          profileImageUrl,
        };
      }, {
        userName: this.sel.userName,
        userDescription: this.sel.userDescription,
        userFollowersCount: this.sel.userFollowersCount,
        userFollowingCount: this.sel.userFollowingCount,
        userProfileImage: this.sel.userProfileImage,
        handle,
      });
    } catch (err) {
      this.log.error(`getUser error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  async getTweet(tweetUrl: string, accountId?: string): Promise<TweetResult> {
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    try {
      await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector(this.sel.tweetArticle, { timeout: 15_000 });
      await page.waitForTimeout(1_500);

      const results = await this.extractTweets(page, 1);
      if (results.length === 0) throw new Error('Tweet not found or could not be parsed');
      return { ...results[0], url: tweetUrl };
    } catch (err) {
      this.log.error(`getTweet error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  async getUserTweets(handle: string, limit = 20, accountId?: string): Promise<TweetResult[]> {
    const acctId = await this.resolveAccountId(accountId);
    return this.browser.readProfileTweets(handle, limit, acctId);
  }

  async searchUsers(
    query: string,
    limit = 20,
    accountId?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<UserResult[]> {
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    try {
      const encoded = encodeURIComponent(query);
      await page.goto(`https://x.com/search?q=${encoded}&f=user`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector('[data-testid="UserCell"]', { timeout: 15_000 });
      await page.waitForTimeout(1_500);

      const all = await page.evaluate((params) => {
        const cells = Array.from(document.querySelectorAll('[data-testid="UserCell"]')).slice(0, params.limit);
        return cells.map(cell => {
          const nameEl = cell.querySelector('[data-testid="UserName"]');
          const spans = Array.from(nameEl?.querySelectorAll('span') ?? []).map((span) => span.textContent?.trim() ?? '').filter(Boolean);
          const handle = extractHandleFromCell(cell) ?? spans.find((text) => text.startsWith('@'))?.replace('@', '') ?? '';
          const displayName = spans.find((text) => !text.startsWith('@') && text !== '·') ?? '';
          const bio = cell.querySelector('[data-testid="UserDescription"]')?.textContent ?? '';
          return {
            handle,
            displayName,
            bio,
            followersCount: '',
            followingCount: '',
            tweetsCount: '',
            verified: Boolean(cell.querySelector('svg[data-testid="icon-verified"]')),
            profileUrl: `https://x.com/${handle}`,
            profileImageUrl: '',
          };
        }).filter((user) => user.handle || user.displayName || user.bio);

        function extractHandleFromCell(cell: Element): string | null {
          const links = Array.from(cell.querySelectorAll('a[href^="/"], a[href^="https://x.com/"]')) as HTMLAnchorElement[];
          for (const link of links) {
            const parts = new URL(link.href, location.origin).pathname.split('/').filter(Boolean);
            const candidate = parts.length === 1 ? parts[0] : '';
            if (candidate && !['home', 'i', 'intent', 'search', 'settings'].includes(candidate)) return candidate;
          }
          return null;
        }
      }, { limit });

      return options.verifiedOnly ? all.filter((u) => u.verified) : all;
    } catch (err) {
      this.log.error(`searchUsers error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  async getUserFollowers(
    handle: string,
    limit = 50,
    accountId?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<Array<{ handle: string; displayName: string; bio: string; verified: boolean }>> {
    return this.scrapeUserList(`https://x.com/${handle}/followers`, limit, accountId, options);
  }

  async getUserFollowing(
    handle: string,
    limit = 50,
    accountId?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<Array<{ handle: string; displayName: string; bio: string; verified: boolean }>> {
    return this.scrapeUserList(`https://x.com/${handle}/following`, limit, accountId, options);
  }

  async getTweetRetweeters(
    tweetUrl: string,
    limit = 50,
    accountId?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<Array<{ handle: string; displayName: string; bio: string; verified: boolean }>> {
    const url = tweetUrl.replace(/\/$/, '') + '/retweets';
    return this.scrapeUserList(url, limit, accountId, options);
  }

  private async scrapeUserList(
    url: string,
    limit: number,
    accountId: string | undefined,
    options: { verifiedOnly?: boolean },
  ): Promise<Array<{ handle: string; displayName: string; bio: string; verified: boolean }>> {
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector('[data-testid="UserCell"]', { timeout: 15_000 });
      await page.waitForTimeout(2_000);

      if (limit > 20) {
        await page.evaluate(() => window.scrollBy(0, 3000));
        await page.waitForTimeout(1_500);
      }

      const all = await page.evaluate((params) => {
        const cells = Array.from(document.querySelectorAll('[data-testid="UserCell"]')).slice(0, params.limit);
        return cells.map(cell => {
          const nameEl = cell.querySelector('[data-testid="UserName"]');
          const spans = Array.from(nameEl?.querySelectorAll('span') ?? []).map((span) => span.textContent?.trim() ?? '').filter(Boolean);
          const handle = extractHandleFromCell(cell) ?? spans.find((text) => text.startsWith('@'))?.replace('@', '') ?? '';
          const displayName = spans.find((text) => !text.startsWith('@') && text !== '·') ?? '';
          const bio = cell.querySelector('[data-testid="UserDescription"]')?.textContent ?? '';
          const verified = Boolean(cell.querySelector('svg[data-testid="icon-verified"]'));
          return { handle, displayName, bio, verified };
        }).filter((user) => user.handle || user.displayName || user.bio);

        function extractHandleFromCell(cell: Element): string | null {
          const links = Array.from(cell.querySelectorAll('a[href^="/"], a[href^="https://x.com/"]')) as HTMLAnchorElement[];
          for (const link of links) {
            const parts = new URL(link.href, location.origin).pathname.split('/').filter(Boolean);
            const candidate = parts.length === 1 ? parts[0] : '';
            if (candidate && !['home', 'i', 'intent', 'search', 'settings'].includes(candidate)) return candidate;
          }
          return null;
        }
      }, { limit });

      return options.verifiedOnly ? all.filter((u) => u.verified) : all;
    } catch (err) {
      this.log.error(`scrapeUserList(${url}) error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  async getTweetQuotes(tweetUrl: string, limit = 20, accountId?: string): Promise<TweetResult[]> {
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    try {
      const url = tweetUrl.replace(/\/$/, '') + '/quotes';
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      // Empty quotes pages render no tweet articles; tolerate the timeout
      // and return an empty list rather than throwing.
      try {
        await page.waitForSelector(this.sel.tweetArticle, { timeout: 8_000 });
      } catch {
        return [];
      }
      await page.waitForTimeout(1_500);

      return await this.extractTweets(page, limit);
    } catch (err) {
      this.log.error(`getTweetQuotes error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  async getTweetReplies(tweetUrl: string, limit = 20, accountId?: string): Promise<TweetResult[]> {
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    try {
      await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      try {
        await page.waitForSelector(this.sel.tweetArticle, { timeout: 12_000 });
      } catch {
        // Tweet page didn't render — likely deleted/protected. Return [] instead
        // of bubbling a timeout error, since "no replies" is a valid answer.
        return [];
      }
      await page.waitForTimeout(2_000);

      // extractTweets returns all article elements; the first is the parent tweet.
      // Drop entries whose URL matches the requested tweetUrl to keep just replies.
      const all = await this.extractTweets(page, limit + 1);
      const normalized = tweetUrl.replace(/\/$/, '');
      return all.filter((t) => t.url.replace(/\/$/, '') !== normalized).slice(0, limit);
    } catch (err) {
      this.log.error(`getTweetReplies error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  async getUserMentions(handle: string, limit = 20, accountId?: string): Promise<TweetResult[]> {
    const cleanHandle = handle.replace(/^@/, '');
    return this.searchTweets(`@${cleanHandle}`, limit, accountId);
  }

  async getXTrending(accountId?: string): Promise<Array<{ rank: number; topic: string; tweetCount: string }>> {
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    try {
      await page.goto('https://x.com/explore/tabs/trending', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector('[data-testid="trend"]', { timeout: 15_000 });
      await page.waitForTimeout(1_500);

      return await page.evaluate(() => {
        const trends = Array.from(document.querySelectorAll('[data-testid="trend"]'));
        return trends.map((el, i) => {
          const texts = Array.from(el.querySelectorAll('span'))
            .map((span) => span.textContent?.trim() ?? '')
            .filter(Boolean);
          const topic = texts.find((text) => isTrendTopic(text)) ?? '';
          const countEl = texts.find((text) => /\d/.test(text) && /(\d[\d.,\s]*(b|k|m)\b|posts?|tweets?|gönderi)/i.test(text));
          return {
            rank: i + 1,
            topic,
            tweetCount: countEl ?? '',
          };
        }).filter((trend) => trend.topic);

        function isTrendTopic(text: string): boolean {
          const normalized = text.toLowerCase();
          if (text === '·') return false;
          if (/^\d+$/.test(text)) return false;
          if (/(gündem|trending|trend|sponsorlu|promoted|posts?|tweets?|gönderi)/i.test(normalized)) return false;
          return true;
        }
      });
    } catch (err) {
      this.log.error(`getXTrending error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async extractTweets(page: Page, limit: number): Promise<TweetResult[]> {
    return await page.evaluate((params) => {
      const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]')).slice(0, params.limit);
      return articles.map(a => {
        const text = a.querySelector('[data-testid="tweetText"]')?.textContent ?? '';
        const nameEl = a.querySelector('[data-testid="User-Names"] span');
        const displayName = nameEl?.textContent ?? '';

        const timeEl = a.querySelector('time');
        const postedAt = timeEl?.getAttribute('datetime') ?? '';

        const tweetLink = a.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
        const url = tweetLink?.href ?? '';
        const handle = tweetLink?.pathname?.split('/').filter(Boolean)[0] ?? '';

        const likeEl = a.querySelector('[data-testid="like"] span[data-testid="app-text-transition-container"]');
        const rtEl = a.querySelector('[data-testid="retweet"] span[data-testid="app-text-transition-container"]');
        const replyEl = a.querySelector('[data-testid="reply"] span[data-testid="app-text-transition-container"]');

        return {
          url,
          text,
          handle,
          displayName,
          likeCount: likeEl?.textContent ?? '0',
          retweetCount: rtEl?.textContent ?? '0',
          replyCount: replyEl?.textContent ?? '0',
          postedAt,
        };
      });
    }, { limit });
  }

  private wrapError(err: unknown): Error {
    if (isAuthRequiredError(err)) {
      return new Error('Auth required — session may have expired');
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
