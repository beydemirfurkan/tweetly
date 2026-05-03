import { Injectable } from '@nestjs/common';
import { XDirectReadService } from '@/x-automation/x-direct';
import { XBrowserService } from '@/x-automation/browser/x-browser.service';
import { BaseMcpHandler } from './base.handler';
import type { McpToolArgs, McpToolContext } from './mcp-tool.context';

/**
 * Read-only tools. All run synchronously through XDirectReadService —
 * there is no queueing for reads since they are idempotent and the result
 * needs to flow back to the caller.
 *
 * List-style reads return `{ items, nextCursor }`. Callers paginate by
 * echoing `nextCursor` back as the `cursor` argument.
 */
@Injectable()
export class ReadHandler extends BaseMcpHandler {
  constructor(
    private readonly xDirect: XDirectReadService,
    private readonly _xBrowser: XBrowserService,
  ) {
    super();
    void this._xBrowser;
  }

  async searchTweets(args: McpToolArgs, ctx: McpToolContext) {
    const query = args.query as string;
    if (!query) throw new Error('query is required');
    const limit = Math.min(Number(args.limit ?? 20), 50);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    const cursor = args.cursor as string | undefined;
    return this.xDirect.searchTweets(query, limit, accountId, cursor);
  }

  async getUser(args: McpToolArgs, ctx: McpToolContext) {
    const handle = args.handle as string;
    if (!handle) throw new Error('handle is required');
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    return this.xDirect.getUser(handle, accountId);
  }

  async getTweet(args: McpToolArgs, ctx: McpToolContext) {
    const tweetUrl = args.tweet_url as string;
    if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    return this.xDirect.getTweet(tweetUrl, accountId);
  }

  async getUserTweets(args: McpToolArgs, ctx: McpToolContext) {
    const handle = args.handle as string;
    if (!handle) throw new Error('handle is required');
    const limit = Math.min(Number(args.limit ?? 20), 50);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    if (!accountId) return { items: [], nextCursor: null };
    const cursor = args.cursor as string | undefined;
    return this.xDirect.getUserTweets(handle, limit, accountId, cursor);
  }

  async searchUsers(args: McpToolArgs, ctx: McpToolContext) {
    const query = args.query as string;
    if (!query) throw new Error('query is required');
    const limit = Math.min(Number(args.limit ?? 20), 50);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    const verifiedOnly = Boolean(args.verified_only);
    const cursor = args.cursor as string | undefined;
    return this.xDirect.searchUsers(query, limit, accountId, cursor, { verifiedOnly });
  }

  async getUserFollowers(args: McpToolArgs, ctx: McpToolContext) {
    const handle = args.handle as string;
    if (!handle) throw new Error('handle is required');
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    const verifiedOnly = Boolean(args.verified_only);
    const cursor = args.cursor as string | undefined;
    return this.xDirect.getUserFollowers(handle, limit, accountId, cursor, { verifiedOnly });
  }

  async getUserFollowing(args: McpToolArgs, ctx: McpToolContext) {
    const handle = args.handle as string;
    if (!handle) throw new Error('handle is required');
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    const verifiedOnly = Boolean(args.verified_only);
    const cursor = args.cursor as string | undefined;
    return this.xDirect.getUserFollowing(handle, limit, accountId, cursor, { verifiedOnly });
  }

  async getTweetRetweeters(args: McpToolArgs, ctx: McpToolContext) {
    const tweetUrl = args.tweet_url as string;
    if (!tweetUrl) throw new Error('tweet_url is required');
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    const verifiedOnly = Boolean(args.verified_only);
    const cursor = args.cursor as string | undefined;
    return this.xDirect.getTweetRetweeters(tweetUrl, limit, accountId, cursor, { verifiedOnly });
  }

  async getTweetQuotes(args: McpToolArgs, ctx: McpToolContext) {
    const tweetUrl = args.tweet_url as string;
    if (!tweetUrl) throw new Error('tweet_url is required');
    const limit = Math.min(Number(args.limit ?? 20), 50);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    const cursor = args.cursor as string | undefined;
    return this.xDirect.getTweetQuotes(tweetUrl, limit, accountId, cursor);
  }

  async getTweetReplies(args: McpToolArgs, ctx: McpToolContext) {
    const tweetUrl = args.tweet_url as string;
    if (!tweetUrl) throw new Error('tweet_url is required');
    const limit = Math.min(Number(args.limit ?? 20), 50);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    const cursor = args.cursor as string | undefined;
    return this.xDirect.getTweetReplies(tweetUrl, limit, accountId, cursor);
  }

  async getUserMentions(args: McpToolArgs, ctx: McpToolContext) {
    const handle = args.handle as string;
    if (!handle) throw new Error('handle is required');
    const limit = Math.min(Number(args.limit ?? 20), 50);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    const cursor = args.cursor as string | undefined;
    return this.xDirect.getUserMentions(handle, limit, accountId, cursor);
  }

  async getXTrending(args: McpToolArgs, ctx: McpToolContext) {
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    return this.xDirect.getXTrending(accountId);
  }

  async getUserLikes(args: McpToolArgs, ctx: McpToolContext) {
    const handle = args.handle as string;
    if (!handle) throw new Error('handle is required');
    const limit = Math.min(Number(args.limit ?? 20), 50);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    const cursor = args.cursor as string | undefined;
    return this.xDirect.getUserLikes(handle, limit, accountId, cursor);
  }

  async getMyBookmarks(args: McpToolArgs, ctx: McpToolContext) {
    const limit = Math.min(Number(args.limit ?? 20), 50);
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    const cursor = args.cursor as string | undefined;
    return this.xDirect.getMyBookmarks(limit, accountId, cursor);
  }

  async getListMembers(args: McpToolArgs, ctx: McpToolContext) {
    const listId = args.list_id as string;
    if (!listId || !/^\d+$/.test(listId)) throw new Error('list_id must be numeric');
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    const verifiedOnly = Boolean(args.verified_only);
    const cursor = args.cursor as string | undefined;
    return this.xDirect.getListMembers(listId, limit, accountId, cursor, { verifiedOnly });
  }

  async getMutualFollowers(args: McpToolArgs, ctx: McpToolContext) {
    const handle = args.handle as string;
    if (!handle) throw new Error('handle is required');
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    const verifiedOnly = Boolean(args.verified_only);
    const cursor = args.cursor as string | undefined;
    return this.xDirect.getMutualFollowers(handle, limit, accountId, cursor, { verifiedOnly });
  }

  async getThread(args: McpToolArgs, ctx: McpToolContext) {
    const tweetUrl = args.tweet_url as string;
    if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
    const limit = Math.min(Number(args.limit ?? 20), 50);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    return this.xDirect.getThread(tweetUrl, limit, accountId);
  }
}
