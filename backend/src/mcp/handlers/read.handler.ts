import { Injectable } from '@nestjs/common';
import { XDirectReadService } from '@/x-automation/x-direct';
import { XBrowserService } from '@/x-automation/browser/x-browser.service';
import { BaseMcpHandler } from './base.handler';
import type { McpToolArgs, McpToolContext } from './mcp-tool.context';

/**
 * Read-only tools. All run synchronously through XDirectReadService /
 * XBrowserService — there is no queueing for reads since they are
 * idempotent and the result needs to flow back to the caller.
 */
@Injectable()
export class ReadHandler extends BaseMcpHandler {
  constructor(
    private readonly xDirect: XDirectReadService,
    private readonly xBrowser: XBrowserService,
  ) {
    super();
  }

  async searchTweets(args: McpToolArgs, ctx: McpToolContext) {
    const query = args.query as string;
    if (!query) throw new Error('query is required');
    const limit = Math.min(Number(args.limit ?? 20), 50);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    return this.xDirect.searchTweets(query, limit, accountId);
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
    if (!accountId) return [];
    return this.xBrowser.readProfileTweets(handle, limit, accountId);
  }

  async searchUsers(args: McpToolArgs, ctx: McpToolContext) {
    const query = args.query as string;
    if (!query) throw new Error('query is required');
    const limit = Math.min(Number(args.limit ?? 20), 50);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    const verifiedOnly = Boolean(args.verified_only);
    return this.xDirect.searchUsers(query, limit, accountId, { verifiedOnly });
  }

  async getUserFollowers(args: McpToolArgs, ctx: McpToolContext) {
    const handle = args.handle as string;
    if (!handle) throw new Error('handle is required');
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    const verifiedOnly = Boolean(args.verified_only);
    return this.xDirect.getUserFollowers(handle, limit, accountId, { verifiedOnly });
  }

  async getUserFollowing(args: McpToolArgs, ctx: McpToolContext) {
    const handle = args.handle as string;
    if (!handle) throw new Error('handle is required');
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    const verifiedOnly = Boolean(args.verified_only);
    return this.xDirect.getUserFollowing(handle, limit, accountId, { verifiedOnly });
  }

  async getTweetRetweeters(args: McpToolArgs, ctx: McpToolContext) {
    const tweetUrl = args.tweet_url as string;
    if (!tweetUrl) throw new Error('tweet_url is required');
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    const verifiedOnly = Boolean(args.verified_only);
    return this.xDirect.getTweetRetweeters(tweetUrl, limit, accountId, { verifiedOnly });
  }

  async getTweetQuotes(args: McpToolArgs, ctx: McpToolContext) {
    const tweetUrl = args.tweet_url as string;
    if (!tweetUrl) throw new Error('tweet_url is required');
    const limit = Math.min(Number(args.limit ?? 20), 50);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    return this.xDirect.getTweetQuotes(tweetUrl, limit, accountId);
  }

  async getTweetReplies(args: McpToolArgs, ctx: McpToolContext) {
    const tweetUrl = args.tweet_url as string;
    if (!tweetUrl) throw new Error('tweet_url is required');
    const limit = Math.min(Number(args.limit ?? 20), 50);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    return this.xDirect.getTweetReplies(tweetUrl, limit, accountId);
  }

  async getUserMentions(args: McpToolArgs, ctx: McpToolContext) {
    const handle = args.handle as string;
    if (!handle) throw new Error('handle is required');
    const limit = Math.min(Number(args.limit ?? 20), 50);
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    return this.xDirect.getUserMentions(handle, limit, accountId);
  }

  async getXTrending(args: McpToolArgs, ctx: McpToolContext) {
    const accountId = await ctx.resolveAccountIdOptional(args.account_id as string | undefined);
    return this.xDirect.getXTrending(accountId);
  }
}
