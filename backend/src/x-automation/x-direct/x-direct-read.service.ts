import { Injectable } from '@nestjs/common';
import type { Page } from 'patchright';
import { XDirectBaseService } from './x-direct-base.service';
import type { TweetResult, UserResult, UserListItem } from './x-direct.types';

/**
 * Read-only operations: search, profile lookup, tweet lookup, user lists,
 * trends. Reads run synchronously in both noop and patchright mode (the
 * browser launch handles the dry-run via XBrowserService internals).
 */
@Injectable()
export class XDirectReadService extends XDirectBaseService {
  async searchTweets(query: string, limit = 20, accountId?: string): Promise<TweetResult[]> {
    return this.withSession('searchTweets', accountId, async (page, acctId) => {
      const encoded = encodeURIComponent(query);
      await page.goto(`https://x.com/search?q=${encoded}&f=live`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector(this.sel.tweetArticle, { timeout: 20_000 });
      await page.waitForTimeout(2_000);
      return this.extractTweets(page, limit);
    });
  }

  async getUser(handle: string, accountId?: string): Promise<UserResult> {
    return this.withSession('getUser', accountId, async (page) => {
      await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(5_000);

      const raw = await page.evaluate((params) => {
        const nameEl = document.querySelector(params.userName);
        const bioEl = document.querySelector(params.userDescription);
        const followersEl = document.querySelector(params.userFollowersCount);
        const followingEl = document.querySelector(params.userFollowingCount);
        const verifiedEl = document.querySelector(params.verifiedIcon);
        const avatarEl = document.querySelector(params.userProfileImage) as HTMLImageElement | null;

        const fullName = nameEl?.querySelector('span')?.textContent ?? '';
        const handleEl = nameEl?.querySelectorAll('span')?.[1];
        const rawHandle = handleEl?.textContent?.replace('@', '') ?? params.handle;

        // Modern X profile renders the post count as a small header line
        // under the back-arrow ("112 posts" / "112 gönderi"), NOT inside
        // any tab link. Scope to primaryColumn (the profile column) and
        // pick the first leaf-ish element whose trimmed text exactly
        // matches "<number> posts|gönderi". Anchored match avoids partial
        // hits like "post 112 ago".
        let tweetsCount = '';
        const tweetCountFullRe = /^[\d.,]+\s*[KkMmBb]?\s+(?:posts?|gönderi)$/iu;
        const tweetCountNumRe = /^([\d.,]+\s*[KkMmBb]?)/;
        const scopeEl = document.querySelector('[data-testid="primaryColumn"]') ?? document.body;
        const candidates = scopeEl.querySelectorAll('span, div, h1, h2');
        for (const el of candidates) {
          const text = (el.textContent ?? '').trim();
          // Skip both empty and obviously-too-long elements (page bodies
          // would otherwise match because their textContent contains
          // "112 posts" somewhere).
          if (text.length === 0 || text.length > 30) continue;
          if (!tweetCountFullRe.test(text)) continue;
          const numMatch = text.match(tweetCountNumRe);
          if (numMatch) {
            tweetsCount = numMatch[1].trim();
            break;
          }
        }

        // Legacy fallbacks — kept for the rare case the header element
        // is missing (e.g. shadow-DOM-skinned variants seen on some
        // accounts). All three look for a count next to a profile link.
        if (!tweetsCount) {
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
        verifiedIcon: this.sel.verifiedIcon,
        handle,
      });
      return {
        ...raw,
        displayName: this.sanitizeText(raw.displayName),
        bio: this.sanitizeText(raw.bio),
      };
    });
  }

  async getTweet(tweetUrl: string, accountId?: string): Promise<TweetResult> {
    return this.withSession('getTweet', accountId, async (page, acctId) => {
      await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector(this.sel.tweetArticle, { timeout: 15_000 });
      await page.waitForTimeout(1_500);

      const results = await this.extractTweets(page, 1);
      if (results.length === 0) throw new Error('Tweet not found or could not be parsed');
      return { ...results[0], url: tweetUrl };
    });
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
    return this.withSession('searchUsers', accountId, async (page, acctId) => {
      const encoded = encodeURIComponent(query);
      await page.goto(`https://x.com/search?q=${encoded}&f=user`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector(this.sel.userCell, { timeout: 15_000 });
      await page.waitForTimeout(1_500);

      const all = await page.evaluate((params) => {
        const cells = Array.from(document.querySelectorAll(params.userCell)).slice(0, params.limit);
        return cells.map(cell => {
          const nameEl = cell.querySelector(params.userName);
          const spans = Array.from(nameEl?.querySelectorAll('span') ?? []).map((span) => span.textContent?.trim() ?? '').filter(Boolean);
          const handle = extractHandleFromCell(cell) ?? spans.find((text) => text.startsWith('@'))?.replace('@', '') ?? '';
          const displayName = spans.find((text) => !text.startsWith('@') && text !== '·') ?? '';
          const bio = cell.querySelector(params.userDescription)?.textContent ?? '';
          return {
            handle,
            displayName,
            bio,
            followersCount: '',
            followingCount: '',
            tweetsCount: '',
            verified: Boolean(cell.querySelector(params.verifiedIcon)),
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
      }, { limit, userCell: this.sel.userCell, userName: this.sel.userName, userDescription: this.sel.userDescription, verifiedIcon: this.sel.verifiedIcon });

      return options.verifiedOnly ? all.filter((u) => u.verified) : all;
    });
  }

  async getUserFollowers(
    handle: string,
    limit = 50,
    accountId?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<UserListItem[]> {
    return this.scrapeUserList(`https://x.com/${handle}/followers`, limit, accountId, options);
  }

  async getUserFollowing(
    handle: string,
    limit = 50,
    accountId?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<UserListItem[]> {
    return this.scrapeUserList(`https://x.com/${handle}/following`, limit, accountId, options);
  }

  async getTweetRetweeters(
    tweetUrl: string,
    limit = 50,
    accountId?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<UserListItem[]> {
    const url = tweetUrl.replace(/\/$/, '') + '/retweets';
    return this.scrapeUserList(url, limit, accountId, options);
  }

  async getTweetQuotes(tweetUrl: string, limit = 20, accountId?: string): Promise<TweetResult[]> {
    return this.withSession('getTweetQuotes', accountId, async (page, acctId) => {
      const url = tweetUrl.replace(/\/$/, '') + '/quotes';
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      try {
        await page.waitForSelector(this.sel.tweetArticle, { timeout: 8_000 });
      } catch {
        return [];
      }
      await page.waitForTimeout(1_500);
      return this.extractTweets(page, limit);
    });
  }

  async getTweetReplies(tweetUrl: string, limit = 20, accountId?: string): Promise<TweetResult[]> {
    return this.withSession('getTweetReplies', accountId, async (page, acctId) => {
      await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      try {
        await page.waitForSelector(this.sel.tweetArticle, { timeout: 12_000 });
      } catch {
        return [];
      }
      await page.waitForTimeout(2_000);

      // extractTweets returns all article elements; the first is the parent tweet.
      const all = await this.extractTweets(page, limit + 1);
      const normalized = tweetUrl.replace(/\/$/, '');
      return all.filter((t) => t.url.replace(/\/$/, '') !== normalized).slice(0, limit);
    });
  }

  async getUserMentions(handle: string, limit = 20, accountId?: string): Promise<TweetResult[]> {
    const cleanHandle = handle.replace(/^@/, '');
    return this.searchTweets(`@${cleanHandle}`, limit, accountId);
  }

  async getUserLikes(handle: string, limit = 20, accountId?: string): Promise<TweetResult[]> {
    const cleanHandle = handle.replace(/^@/, '');
    return this.withSession('getUserLikes', accountId, async (page, acctId) => {
      await page.goto(`https://x.com/${cleanHandle}/likes`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      try {
        await page.waitForSelector(this.sel.tweetArticle, { timeout: 12_000 });
      } catch {
        return [];
      }
      await page.waitForTimeout(1_500);
      if (limit > 20) {
        await page.evaluate(() => window.scrollBy(0, 3000));
        await page.waitForTimeout(1_500);
      }
      return this.extractTweets(page, limit);
    });
  }

  async getMyBookmarks(limit = 20, accountId?: string): Promise<TweetResult[]> {
    return this.withSession('getMyBookmarks', accountId, async (page, acctId) => {
      await page.goto('https://x.com/i/bookmarks', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      try {
        await page.waitForSelector(this.sel.tweetArticle, { timeout: 12_000 });
      } catch {
        return [];
      }
      await page.waitForTimeout(1_500);
      if (limit > 20) {
        await page.evaluate(() => window.scrollBy(0, 3000));
        await page.waitForTimeout(1_500);
      }
      return this.extractTweets(page, limit);
    });
  }

  async getListMembers(
    listId: string,
    limit = 50,
    accountId?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<UserListItem[]> {
    return this.scrapeUserList(`https://x.com/i/lists/${listId}/members`, limit, accountId, options);
  }

  async getMutualFollowers(
    handle: string,
    limit = 50,
    accountId?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<UserListItem[]> {
    const cleanHandle = handle.replace(/^@/, '');
    return this.scrapeUserList(
      `https://x.com/${cleanHandle}/followers_you_follow`,
      limit,
      accountId,
      options,
    );
  }

  async getThread(rootTweetUrl: string, limit = 20, accountId?: string): Promise<TweetResult[]> {
    return this.withSession('getThread', accountId, async (page, acctId) => {
      await page.goto(rootTweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      try {
        await page.waitForSelector(this.sel.tweetArticle, { timeout: 12_000 });
      } catch {
        return [];
      }
      await page.waitForTimeout(2_000);

      // Pull a generous buffer; we filter to same-author chain below.
      const cap = Math.min(Math.max(limit, 1), 50);
      const all = await this.extractTweets(page, cap * 2);
      if (all.length === 0) return [];

      // Root handle = path segment of the root URL (avoids relying on
      // which article appears first in DOM after redirects).
      const rootPath = new URL(rootTweetUrl).pathname.split('/').filter(Boolean);
      const rootHandle = rootPath[0]?.toLowerCase() ?? '';

      const chain: TweetResult[] = [];
      for (const tweet of all) {
        if (tweet.handle.toLowerCase() === rootHandle) chain.push(tweet);
        if (chain.length >= cap) break;
      }
      return chain;
    });
  }

  async getXTrending(accountId?: string): Promise<Array<{ rank: number; topic: string; tweetCount: string }>> {
    return this.withSession('getXTrending', accountId, async (page, acctId) => {
      await page.goto('https://x.com/explore/tabs/trending', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector(this.sel.trend, { timeout: 15_000 });
      await page.waitForTimeout(1_500);

      return page.evaluate((params) => {
        const trends = Array.from(document.querySelectorAll(params.trend));
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
      }, { trend: this.sel.trend });
    });
  }

  private async scrapeUserList(
    url: string,
    limit: number,
    accountId: string | undefined,
    options: { verifiedOnly?: boolean },
  ): Promise<UserListItem[]> {
    return this.withSession(`scrapeUserList(${url})`, accountId, async (page, acctId) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector(this.sel.userCell, { timeout: 15_000 });
      await page.waitForTimeout(2_000);

      if (limit > 20) {
        await page.evaluate(() => window.scrollBy(0, 3000));
        await page.waitForTimeout(1_500);
      }

      const all = await page.evaluate((params) => {
        const cells = Array.from(document.querySelectorAll(params.userCell)).slice(0, params.limit);
        return cells.map(cell => {
          const nameEl = cell.querySelector(params.userName);
          const spans = Array.from(nameEl?.querySelectorAll('span') ?? []).map((span) => span.textContent?.trim() ?? '').filter(Boolean);
          const handle = extractHandleFromCell(cell) ?? spans.find((text) => text.startsWith('@'))?.replace('@', '') ?? '';
          const displayName = spans.find((text) => !text.startsWith('@') && text !== '·') ?? '';
          const bio = cell.querySelector(params.userDescription)?.textContent ?? '';
          const verified = Boolean(cell.querySelector(params.verifiedIcon));
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
      }, { limit, userCell: this.sel.userCell, userName: this.sel.userName, userDescription: this.sel.userDescription, verifiedIcon: this.sel.verifiedIcon });

      return options.verifiedOnly ? all.filter((u) => u.verified) : all;
    });
  }

  private async extractTweets(page: Page, limit: number): Promise<TweetResult[]> {
    const raw = await page.evaluate((params) => {
      const articles = Array.from(document.querySelectorAll(params.tweetArticle)).slice(0, params.limit);
      return articles.map(a => {
        const text = a.querySelector(params.tweetText)?.textContent ?? '';
        const nameEl = a.querySelector(params.userNames);
        const displayName = nameEl?.textContent ?? '';

        const timeEl = a.querySelector('time');
        const postedAt = timeEl?.getAttribute('datetime') ?? '';

        const tweetLink = a.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
        const url = tweetLink?.href ?? '';
        const handle = tweetLink?.pathname?.split('/').filter(Boolean)[0] ?? '';

        const likeEl = a.querySelector(params.likeCount);
        const rtEl = a.querySelector(params.retweetCount);
        const replyEl = a.querySelector(params.replyCount);

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
    }, {
      limit,
      tweetArticle: this.sel.tweetArticle,
      tweetText: this.sel.tweetText,
      userNames: this.sel.userNames,
      likeCount: this.sel.tweetLikeCount,
      retweetCount: this.sel.tweetRetweetCount,
      replyCount: this.sel.tweetReplyCount,
    });
    return raw.map((t) => ({
      ...t,
      text: this.sanitizeText(t.text),
      displayName: this.sanitizeText(t.displayName),
    }));
  }
}
