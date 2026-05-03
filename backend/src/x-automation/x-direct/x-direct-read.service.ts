import { Injectable } from '@nestjs/common';
import { AccountsService } from '@/accounts/accounts.service';
import { XBrowserService } from '@/x-automation/browser/x-browser.service';
import { SelectorRegistry } from '@/x-automation/browser/selector-registry';
import { XDirectBaseService } from './x-direct-base.service';
import type { PaginatedResult } from './pagination.util';
import {
  extractTweetsFromPage,
  paginateTweets,
  paginateUsers,
  type TweetSelectors,
  type UserCellSelectors,
} from './read-page.utils';
import type {
  ListDetailItem,
  ListMetaItem,
  TweetResult,
  UserResult,
  UserListItem,
} from './x-direct.types';

/**
 * Read-only operations: search, profile lookup, tweet lookup, user lists,
 * trends. Reads run synchronously in both noop and patchright mode (the
 * browser launch handles the dry-run via XBrowserService internals).
 *
 * List-style endpoints return `PaginatedResult<T>`: callers pass back the
 * `nextCursor` string verbatim to fetch subsequent pages. Single-resource
 * endpoints (getUser/getTweet) and the small fixed-size getXTrending /
 * getThread surfaces return their plain types unchanged.
 */
@Injectable()
export class XDirectReadService extends XDirectBaseService {
  // Explicit ctor so TypeScript emits design:paramtypes for NestJS DI —
  // subclasses without their own ctor get no metadata even when decorated.
  constructor(browser: XBrowserService, sel: SelectorRegistry, accounts: AccountsService) {
    super(browser, sel, accounts);
  }

  // ── List-style reads (cursor-paginated) ───────────────────────────────

  async searchTweets(
    query: string,
    limit = 20,
    accountId?: string,
    cursor?: string,
  ): Promise<PaginatedResult<TweetResult>> {
    return this.withSession('searchTweets', accountId, async (page, acctId) => {
      const encoded = encodeURIComponent(query);
      await page.goto(`https://x.com/search?q=${encoded}&f=live`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector(this.sel.tweetArticle, { timeout: 20_000 });
      await page.waitForTimeout(2_000);
      return paginateTweets(page, this.tweetSel(), limit, cursor, (s) => this.sanitizeText(s));
    });
  }

  async searchUsers(
    query: string,
    limit = 20,
    accountId?: string,
    cursor?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<PaginatedResult<UserListItem>> {
    return this.withSession('searchUsers', accountId, async (page, acctId) => {
      const encoded = encodeURIComponent(query);
      await page.goto(`https://x.com/search?q=${encoded}&f=user`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector(this.sel.userCell, { timeout: 15_000 });
      await page.waitForTimeout(1_500);
      return paginateUsers(page, this.userSel(), limit, cursor, options);
    });
  }

  async getUserTweets(
    handle: string,
    limit = 20,
    accountId?: string,
    cursor?: string,
  ): Promise<PaginatedResult<TweetResult>> {
    const cleanHandle = handle.replace(/^@/, '');
    return this.withSession('getUserTweets', accountId, async (page, acctId) => {
      await page.goto(`https://x.com/${cleanHandle}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await this.browser.assertSessionHealthy(page, acctId);
      try {
        await page.waitForSelector(this.sel.tweetArticle, { timeout: 15_000 });
      } catch {
        return { items: [], nextCursor: null };
      }
      await page.waitForTimeout(1_500);
      return paginateTweets(page, this.tweetSel(), limit, cursor, (s) => this.sanitizeText(s));
    });
  }

  async getUserFollowers(
    handle: string,
    limit = 50,
    accountId?: string,
    cursor?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<PaginatedResult<UserListItem>> {
    return this.scrapeUserList(`https://x.com/${handle}/followers`, limit, accountId, cursor, options);
  }

  async getUserFollowing(
    handle: string,
    limit = 50,
    accountId?: string,
    cursor?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<PaginatedResult<UserListItem>> {
    return this.scrapeUserList(`https://x.com/${handle}/following`, limit, accountId, cursor, options);
  }

  async getTweetRetweeters(
    tweetUrl: string,
    limit = 50,
    accountId?: string,
    cursor?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<PaginatedResult<UserListItem>> {
    const url = tweetUrl.replace(/\/$/, '') + '/retweets';
    return this.scrapeUserList(url, limit, accountId, cursor, options);
  }

  async getTweetQuotes(
    tweetUrl: string,
    limit = 20,
    accountId?: string,
    cursor?: string,
  ): Promise<PaginatedResult<TweetResult>> {
    return this.withSession('getTweetQuotes', accountId, async (page, acctId) => {
      const url = tweetUrl.replace(/\/$/, '') + '/quotes';
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      try {
        await page.waitForSelector(this.sel.tweetArticle, { timeout: 8_000 });
      } catch {
        return { items: [], nextCursor: null };
      }
      await page.waitForTimeout(1_500);
      return paginateTweets(page, this.tweetSel(), limit, cursor, (s) => this.sanitizeText(s));
    });
  }

  async getTweetReplies(
    tweetUrl: string,
    limit = 20,
    accountId?: string,
    cursor?: string,
  ): Promise<PaginatedResult<TweetResult>> {
    return this.withSession('getTweetReplies', accountId, async (page, acctId) => {
      await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      try {
        await page.waitForSelector(this.sel.tweetArticle, { timeout: 12_000 });
      } catch {
        return { items: [], nextCursor: null };
      }
      await page.waitForTimeout(2_000);

      // The conversation page renders the parent tweet first; drop it from
      // the reply list. We over-fetch then filter.
      const normalizedRoot = tweetUrl.replace(/\/$/, '');
      const page1 = await paginateTweets(
        page,
        this.tweetSel(),
        limit + 1,
        cursor,
        (s) => this.sanitizeText(s),
      );
      const items = page1.items
        .filter((t) => t.url.replace(/\/$/, '') !== normalizedRoot)
        .slice(0, limit);
      return { items, nextCursor: items.length === limit ? page1.nextCursor : null };
    });
  }

  async getUserMentions(
    handle: string,
    limit = 20,
    accountId?: string,
    cursor?: string,
  ): Promise<PaginatedResult<TweetResult>> {
    const cleanHandle = handle.replace(/^@/, '');
    return this.searchTweets(`@${cleanHandle}`, limit, accountId, cursor);
  }

  async getUserLikes(
    handle: string,
    limit = 20,
    accountId?: string,
    cursor?: string,
  ): Promise<PaginatedResult<TweetResult>> {
    const cleanHandle = handle.replace(/^@/, '');
    return this.withSession('getUserLikes', accountId, async (page, acctId) => {
      await page.goto(`https://x.com/${cleanHandle}/likes`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await this.browser.assertSessionHealthy(page, acctId);
      try {
        await page.waitForSelector(this.sel.tweetArticle, { timeout: 12_000 });
      } catch {
        return { items: [], nextCursor: null };
      }
      await page.waitForTimeout(1_500);
      return paginateTweets(page, this.tweetSel(), limit, cursor, (s) => this.sanitizeText(s));
    });
  }

  async getMyBookmarks(
    limit = 20,
    accountId?: string,
    cursor?: string,
  ): Promise<PaginatedResult<TweetResult>> {
    return this.withSession('getMyBookmarks', accountId, async (page, acctId) => {
      await page.goto('https://x.com/i/bookmarks', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      try {
        await page.waitForSelector(this.sel.tweetArticle, { timeout: 12_000 });
      } catch {
        return { items: [], nextCursor: null };
      }
      await page.waitForTimeout(1_500);
      return paginateTweets(page, this.tweetSel(), limit, cursor, (s) => this.sanitizeText(s));
    });
  }

  async getListMembers(
    listId: string,
    limit = 50,
    accountId?: string,
    cursor?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<PaginatedResult<UserListItem>> {
    return this.scrapeUserList(
      `https://x.com/i/lists/${listId}/members`,
      limit,
      accountId,
      cursor,
      options,
    );
  }

  async getMutualFollowers(
    handle: string,
    limit = 50,
    accountId?: string,
    cursor?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<PaginatedResult<UserListItem>> {
    const cleanHandle = handle.replace(/^@/, '');
    return this.scrapeUserList(
      `https://x.com/${cleanHandle}/followers_you_follow`,
      limit,
      accountId,
      cursor,
      options,
    );
  }

  async getListSubscribers(
    listId: string,
    limit = 50,
    accountId?: string,
    cursor?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<PaginatedResult<UserListItem>> {
    return this.scrapeUserList(
      `https://x.com/i/lists/${listId}/subscribers`,
      limit,
      accountId,
      cursor,
      options,
    );
  }

  async getUserLists(handle: string, accountId?: string): Promise<ListMetaItem[]> {
    const cleanHandle = handle.replace(/^@/, '');
    return this.withSession('getUserLists', accountId, async (page, acctId) => {
      await page.goto(`https://x.com/${cleanHandle}/lists`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await this.browser.assertSessionHealthy(page, acctId);
      // X's lists page renders each list as a link to /i/lists/<id>; if
      // the user has none, there's nothing to wait for and we return empty.
      try {
        await page.waitForSelector('a[href*="/i/lists/"]', { timeout: 8_000 });
      } catch {
        return [];
      }
      await page.waitForTimeout(1_500);

      const raw = await page.evaluate(() => {
        const seen = new Set<string>();
        const items: Array<{
          listId: string;
          name: string;
          description: string;
          memberCount: string;
          ownerHandle: string;
          url: string;
        }> = [];
        const links = Array.from(
          document.querySelectorAll('a[href*="/i/lists/"]'),
        ) as HTMLAnchorElement[];
        for (const link of links) {
          const m = link.pathname.match(/\/i\/lists\/(\d+)(?:$|\/)/);
          if (!m) continue;
          const listId = m[1];
          if (seen.has(listId)) continue;
          seen.add(listId);
          // Find the enclosing card. The list card on X usually wraps
          // multiple spans for name + member count; we grab the
          // closest container with > 1 line of text.
          let card: Element = link;
          for (let i = 0; i < 5 && card.parentElement; i++) {
            card = card.parentElement;
            if ((card.textContent ?? '').trim().split('\n').filter(Boolean).length >= 2) break;
          }
          const spans = Array.from(card.querySelectorAll('span'))
            .map((s) => s.textContent?.trim() ?? '')
            .filter(Boolean);
          // Heuristic: first non-numeric, non-"@handle" span = name; the
          // span containing "member"/"üye" = memberCount; the @-prefixed
          // span = ownerHandle; the last long span = description.
          const name = spans.find((s) => !/^@/.test(s) && !/member|üye/i.test(s)) ?? '';
          const memberCount =
            spans.find((s) => /^[\d.,]+\s*(member|üye)/i.test(s))?.match(/[\d.,]+/)?.[0] ?? '';
          const ownerHandle = (spans.find((s) => /^@/.test(s)) ?? '').replace(/^@/, '');
          const description =
            spans.filter((s) => s !== name && !/^@/.test(s) && !/member|üye/i.test(s)).join(' ');
          items.push({
            listId,
            name,
            description,
            memberCount,
            ownerHandle,
            url: `https://x.com/i/lists/${listId}`,
          });
        }
        return items;
      });

      return raw.map((item) => ({
        ...item,
        name: this.sanitizeText(item.name),
        description: this.sanitizeText(item.description),
      }));
    });
  }

  async getList(listId: string, accountId?: string): Promise<ListDetailItem> {
    return this.withSession('getList', accountId, async (page, acctId) => {
      await page.goto(`https://x.com/i/lists/${listId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await this.browser.assertSessionHealthy(page, acctId);
      // Header content lives inside primaryColumn before the timeline loads.
      await page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 15_000 });
      await page.waitForTimeout(2_000);

      const raw = await page.evaluate(() => {
        const col = document.querySelector('[data-testid="primaryColumn"]');
        if (!col) return null;
        // List header h2 typically holds the name. Description is the
        // following paragraph-ish span. Member/Subscriber counts are
        // labelled links under the header.
        const nameEl = col.querySelector('h2');
        const name = nameEl?.textContent?.trim() ?? '';
        const spans = Array.from(col.querySelectorAll('span'))
          .map((s) => s.textContent?.trim() ?? '')
          .filter(Boolean);
        const memberCount =
          spans.find((s) => /^[\d.,]+\s*(member|üye)/i.test(s))?.match(/[\d.,]+/)?.[0] ?? '';
        const subscriberCount =
          spans.find((s) => /^[\d.,]+\s*(subscriber|abone)/i.test(s))?.match(/[\d.,]+/)?.[0] ?? '';
        // Owner is rendered as an avatar link to /<handle> — pick the first.
        const ownerLink = Array.from(
          col.querySelectorAll('a[href^="/"]'),
        ).find((a) => {
          const path = (a as HTMLAnchorElement).pathname.split('/').filter(Boolean);
          return (
            path.length === 1 &&
            !['i', 'home', 'explore', 'notifications', 'messages'].includes(path[0])
          );
        }) as HTMLAnchorElement | undefined;
        const ownerHandle = ownerLink?.pathname.replace('/', '') ?? '';
        const ownerDisplayName = ownerLink?.querySelector('span')?.textContent?.trim() ?? '';
        const description =
          spans.find((s) => s !== name && s.length > 8 && !/member|subscriber|üye|abone/i.test(s)) ??
          '';
        return { name, description, memberCount, subscriberCount, ownerHandle, ownerDisplayName };
      });

      if (!raw) throw new Error(`list ${listId} not found or could not be parsed`);

      return {
        listId,
        name: this.sanitizeText(raw.name),
        description: this.sanitizeText(raw.description),
        memberCount: raw.memberCount,
        subscriberCount: raw.subscriberCount,
        ownerHandle: raw.ownerHandle,
        ownerDisplayName: this.sanitizeText(raw.ownerDisplayName),
        url: `https://x.com/i/lists/${listId}`,
      };
    });
  }

  // ── Single-resource and small-fixed-list reads (no pagination) ────────

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
        // matches "<number> posts|gönderi".
        let tweetsCount = '';
        const tweetCountFullRe = /^[\d.,]+\s*[KkMmBb]?\s+(?:posts?|gönderi)$/iu;
        const tweetCountNumRe = /^([\d.,]+\s*[KkMmBb]?)/;
        const scopeEl = document.querySelector('[data-testid="primaryColumn"]') ?? document.body;
        const candidates = scopeEl.querySelectorAll('span, div, h1, h2');
        for (const el of candidates) {
          const text = (el.textContent ?? '').trim();
          if (text.length === 0 || text.length > 30) continue;
          if (!tweetCountFullRe.test(text)) continue;
          const numMatch = text.match(tweetCountNumRe);
          if (numMatch) {
            tweetsCount = numMatch[1].trim();
            break;
          }
        }

        if (!tweetsCount) {
          const profileHandle = `/${rawHandle}`;
          const allStatLinks = document.querySelectorAll(
            `a[href="${profileHandle}"], a[href="${profileHandle}/"]`,
          );
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

      const results = await extractTweetsFromPage(page, this.tweetSel(), 1, (s) =>
        this.sanitizeText(s),
      );
      if (results.length === 0) throw new Error('Tweet not found or could not be parsed');
      return { ...results[0], url: tweetUrl };
    });
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
      const all = await extractTweetsFromPage(page, this.tweetSel(), cap * 2, (s) =>
        this.sanitizeText(s),
      );
      if (all.length === 0) return [];

      // Root handle = path segment of the root URL (avoids relying on which
      // article appears first in DOM after redirects).
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

  async getXTrending(
    accountId?: string,
  ): Promise<Array<{ rank: number; topic: string; tweetCount: string }>> {
    return this.withSession('getXTrending', accountId, async (page, acctId) => {
      await page.goto('https://x.com/explore/tabs/trending', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await this.browser.assertSessionHealthy(page, acctId);
      await page.waitForSelector(this.sel.trend, { timeout: 15_000 });
      await page.waitForTimeout(1_500);

      return page.evaluate((params) => {
        const trends = Array.from(document.querySelectorAll(params.trend));
        return trends
          .map((el, i) => {
            const texts = Array.from(el.querySelectorAll('span'))
              .map((span) => span.textContent?.trim() ?? '')
              .filter(Boolean);
            const topic = texts.find((text) => isTrendTopic(text)) ?? '';
            const countEl = texts.find(
              (text) =>
                /\d/.test(text) && /(\d[\d.,\s]*(b|k|m)\b|posts?|tweets?|gönderi)/i.test(text),
            );
            return { rank: i + 1, topic, tweetCount: countEl ?? '' };
          })
          .filter((trend) => trend.topic);

        function isTrendTopic(text: string): boolean {
          const normalized = text.toLowerCase();
          if (text === '·') return false;
          if (/^\d+$/.test(text)) return false;
          if (/(gündem|trending|trend|sponsorlu|promoted|posts?|tweets?|gönderi)/i.test(normalized))
            return false;
          return true;
        }
      }, { trend: this.sel.trend });
    });
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  private async scrapeUserList(
    url: string,
    limit: number,
    accountId: string | undefined,
    cursor: string | undefined,
    options: { verifiedOnly?: boolean },
  ): Promise<PaginatedResult<UserListItem>> {
    return this.withSession(`scrapeUserList(${url})`, accountId, async (page, acctId) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.browser.assertSessionHealthy(page, acctId);
      try {
        await page.waitForSelector(this.sel.userCell, { timeout: 15_000 });
      } catch {
        return { items: [], nextCursor: null };
      }
      await page.waitForTimeout(2_000);
      return paginateUsers(page, this.userSel(), limit, cursor, options);
    });
  }

  private tweetSel(): TweetSelectors {
    return {
      tweetArticle: this.sel.tweetArticle,
      tweetText: this.sel.tweetText,
      userNames: this.sel.userNames,
      tweetLikeCount: this.sel.tweetLikeCount,
      tweetRetweetCount: this.sel.tweetRetweetCount,
      tweetReplyCount: this.sel.tweetReplyCount,
    };
  }

  private userSel(): UserCellSelectors {
    return {
      userCell: this.sel.userCell,
      userName: this.sel.userName,
      userDescription: this.sel.userDescription,
      verifiedIcon: this.sel.verifiedIcon,
    };
  }
}
