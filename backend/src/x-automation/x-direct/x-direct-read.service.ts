import { Injectable } from '@nestjs/common';
import { AccountsService } from '@/accounts/accounts.service';
import { XBrowserService } from '@/x-automation/browser/x-browser.service';
import { SelectorRegistry } from '@/x-automation/browser/selector-registry';
import { XDirectBaseService } from './x-direct-base.service';
import type { PaginatedResult } from './pagination.util';
import {
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
import type { XDirectReadCtx } from './read-ops/context';
import * as search from './read-ops/search.ops';
import * as user from './read-ops/user.ops';
import * as tweet from './read-ops/tweet.ops';
import * as list from './read-ops/list.ops';
import * as timeline from './read-ops/timeline.ops';

/**
 * Read-only operations: search, profile lookup, tweet lookup, user lists,
 * trends. Reads run synchronously in both noop and patchright mode (the
 * browser launch handles the dry-run via XBrowserService internals).
 *
 * List-style endpoints return `PaginatedResult<T>`: callers pass back the
 * `nextCursor` string verbatim to fetch subsequent pages. Single-resource
 * endpoints (getUser/getTweet) and the small fixed-size getXTrending /
 * getThread surfaces return their plain types unchanged.
 *
 * The verb implementations live in `./read-ops/*.ops.ts`, grouped by the
 * entity they operate on (search / user / tweet / list / timeline). This
 * service is a thin façade that wires DI, owns the session-lifecycle
 * helpers from `XDirectBaseService`, and dispatches each public method to
 * the matching ops function.
 */
@Injectable()
export class XDirectReadService extends XDirectBaseService {
  private readonly ctx: XDirectReadCtx;

  constructor(browser: XBrowserService, sel: SelectorRegistry, accounts: AccountsService) {
    super(browser, sel, accounts);
    this.ctx = {
      browser: this.browser,
      sel: this.sel,
      withSession: (op, acctId, fn) => this.withSession(op, acctId, fn),
      sanitizeText: (s) => this.sanitizeText(s),
      tweetSel: () => this.tweetSel(),
      userSel: () => this.userSel(),
      scrapeUserList: (url, l, a, c, o) => this.scrapeUserList(url, l, a, c, o),
    };
  }

  // ── Search ────────────────────────────────────────────────────────────

  searchTweets(
    query: string,
    limit = 20,
    accountId?: string,
    cursor?: string,
  ): Promise<PaginatedResult<TweetResult>> {
    return search.searchTweets(this.ctx, query, limit, accountId, cursor);
  }

  searchUsers(
    query: string,
    limit = 20,
    accountId?: string,
    cursor?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<PaginatedResult<UserListItem>> {
    return search.searchUsers(this.ctx, query, limit, accountId, cursor, options);
  }

  // ── User reads ────────────────────────────────────────────────────────

  getUser(handle: string, accountId?: string): Promise<UserResult> {
    return user.getUser(this.ctx, handle, accountId);
  }

  getUserTweets(
    handle: string,
    limit = 20,
    accountId?: string,
    cursor?: string,
  ): Promise<PaginatedResult<TweetResult>> {
    return user.getUserTweets(this.ctx, handle, limit, accountId, cursor);
  }

  getUserFollowers(
    handle: string,
    limit = 50,
    accountId?: string,
    cursor?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<PaginatedResult<UserListItem>> {
    return user.getUserFollowers(this.ctx, handle, limit, accountId, cursor, options);
  }

  getUserFollowing(
    handle: string,
    limit = 50,
    accountId?: string,
    cursor?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<PaginatedResult<UserListItem>> {
    return user.getUserFollowing(this.ctx, handle, limit, accountId, cursor, options);
  }

  getMutualFollowers(
    handle: string,
    limit = 50,
    accountId?: string,
    cursor?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<PaginatedResult<UserListItem>> {
    return user.getMutualFollowers(this.ctx, handle, limit, accountId, cursor, options);
  }

  getUserMentions(
    handle: string,
    limit = 20,
    accountId?: string,
    cursor?: string,
  ): Promise<PaginatedResult<TweetResult>> {
    return user.getUserMentions(this.ctx, handle, limit, accountId, cursor);
  }

  getUserLikes(
    handle: string,
    limit = 20,
    accountId?: string,
    cursor?: string,
  ): Promise<PaginatedResult<TweetResult>> {
    return user.getUserLikes(this.ctx, handle, limit, accountId, cursor);
  }

  getUserLists(handle: string, accountId?: string): Promise<ListMetaItem[]> {
    return user.getUserLists(this.ctx, handle, accountId);
  }

  // ── Tweet reads ───────────────────────────────────────────────────────

  getTweet(tweetUrl: string, accountId?: string): Promise<TweetResult> {
    return tweet.getTweet(this.ctx, tweetUrl, accountId);
  }

  getThread(rootTweetUrl: string, limit = 20, accountId?: string): Promise<TweetResult[]> {
    return tweet.getThread(this.ctx, rootTweetUrl, limit, accountId);
  }

  getTweetRetweeters(
    tweetUrl: string,
    limit = 50,
    accountId?: string,
    cursor?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<PaginatedResult<UserListItem>> {
    return tweet.getTweetRetweeters(this.ctx, tweetUrl, limit, accountId, cursor, options);
  }

  getTweetQuotes(
    tweetUrl: string,
    limit = 20,
    accountId?: string,
    cursor?: string,
  ): Promise<PaginatedResult<TweetResult>> {
    return tweet.getTweetQuotes(this.ctx, tweetUrl, limit, accountId, cursor);
  }

  getTweetReplies(
    tweetUrl: string,
    limit = 20,
    accountId?: string,
    cursor?: string,
  ): Promise<PaginatedResult<TweetResult>> {
    return tweet.getTweetReplies(this.ctx, tweetUrl, limit, accountId, cursor);
  }

  // ── List reads ────────────────────────────────────────────────────────

  getListMembers(
    listId: string,
    limit = 50,
    accountId?: string,
    cursor?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<PaginatedResult<UserListItem>> {
    return list.getListMembers(this.ctx, listId, limit, accountId, cursor, options);
  }

  getListSubscribers(
    listId: string,
    limit = 50,
    accountId?: string,
    cursor?: string,
    options: { verifiedOnly?: boolean } = {},
  ): Promise<PaginatedResult<UserListItem>> {
    return list.getListSubscribers(this.ctx, listId, limit, accountId, cursor, options);
  }

  getList(listId: string, accountId?: string): Promise<ListDetailItem> {
    return list.getList(this.ctx, listId, accountId);
  }

  // ── Timeline / discovery ──────────────────────────────────────────────

  getMyBookmarks(
    limit = 20,
    accountId?: string,
    cursor?: string,
  ): Promise<PaginatedResult<TweetResult>> {
    return timeline.getMyBookmarks(this.ctx, limit, accountId, cursor);
  }

  getXTrending(
    accountId?: string,
  ): Promise<Array<{ rank: number; topic: string; tweetCount: string }>> {
    return timeline.getXTrending(this.ctx, accountId);
  }

  // ── Internal helpers (shared across the user/list ops) ────────────────

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
