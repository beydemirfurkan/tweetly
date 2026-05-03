import { Injectable } from '@nestjs/common';
import { ActionEnqueueService } from '@/action-engine/action-enqueue.service';
import type { McpToolArgs, McpToolContext } from './mcp-tool.context';

/**
 * Queue-backed write tools. Every handler returns the action id and
 * idempotency key produced by ActionEnqueueService — execution happens
 * asynchronously in the action engine workers.
 */
@Injectable()
export class WriteHandler {
  constructor(private readonly enqueue: ActionEnqueueService) {}

  async postTweet(args: McpToolArgs, ctx: McpToolContext) {
    const text = args.text as string;
    if (!text) throw new Error('text is required');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    const mediaPath = (args.media_path as string | undefined) ?? null;
    const rawPaths = args.media_paths;
    const mediaPaths = Array.isArray(rawPaths)
      ? rawPaths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      : null;
    if (mediaPaths && mediaPaths.length > 4) {
      throw new Error('media_paths limit: at most 4 entries (X composer constraint)');
    }
    const rawAlts = args.alt_texts;
    const altTexts = Array.isArray(rawAlts)
      ? rawAlts.map((t) => (typeof t === 'string' ? t : ''))
      : null;
    return this.enqueue.enqueuePost({
      accountId,
      text,
      mediaPath,
      mediaPaths,
      altTexts,
      scheduledAt: new Date(),
      metadata: { source: 'mcp' },
    });
  }

  async replyToTweet(args: McpToolArgs, ctx: McpToolContext) {
    const text = args.text as string;
    const parentTweetUrl = args.parent_tweet_url as string;
    if (!text) throw new Error('text is required');
    if (!parentTweetUrl?.includes('/status/')) throw new Error('parent_tweet_url must contain /status/');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    return this.enqueue.enqueueReply({
      accountId, text, parentTweetUrl, scheduledAt: new Date(), metadata: { source: 'mcp' },
    });
  }

  async likeTweet(args: McpToolArgs, ctx: McpToolContext) {
    const tweetUrl = args.tweet_url as string;
    if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    return this.enqueue.enqueueLike({
      accountId, targetTweetUrl: tweetUrl, scheduledAt: new Date(), metadata: { source: 'mcp' },
    });
  }

  async retweet(args: McpToolArgs, ctx: McpToolContext) {
    const tweetUrl = args.tweet_url as string;
    if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    return this.enqueue.enqueueRetweet({
      accountId, targetTweetUrl: tweetUrl, scheduledAt: new Date(), metadata: { source: 'mcp' },
    });
  }

  async quoteTweet(args: McpToolArgs, ctx: McpToolContext) {
    const text = args.text as string;
    const tweetUrl = args.tweet_url as string;
    if (!text) throw new Error('text is required');
    if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    return this.enqueue.enqueueQuote({
      accountId, text, targetTweetUrl: tweetUrl, scheduledAt: new Date(), metadata: { source: 'mcp' },
    });
  }

  async bookmarkTweet(args: McpToolArgs, ctx: McpToolContext) {
    const tweetUrl = args.tweet_url as string;
    if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    return this.enqueue.enqueueBookmark({
      accountId, targetTweetUrl: tweetUrl, scheduledAt: new Date(), metadata: { source: 'mcp' },
    });
  }

  async followAccount(args: McpToolArgs, ctx: McpToolContext) {
    const targetHandle = args.target_handle as string;
    if (!targetHandle) throw new Error('target_handle is required');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    return this.enqueue.enqueueFollow({
      accountId, targetHandle, scheduledAt: new Date(), metadata: { source: 'mcp' },
    });
  }

  async postThread(args: McpToolArgs, ctx: McpToolContext) {
    const tweets = args.tweets as string[];
    if (!Array.isArray(tweets) || tweets.length === 0) throw new Error('tweets must be a non-empty array');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    const results: Array<{ index: number; id: string | null }> = [];
    const now = new Date();
    for (let i = 0; i < tweets.length; i++) {
      const r = await this.enqueue.enqueuePost({
        accountId, text: tweets[i],
        scheduledAt: new Date(now.getTime() + i * 5000),
        metadata: { source: 'mcp-thread', threadIndex: i, threadLength: tweets.length },
      });
      results.push({ index: i, id: r.id });
    }
    return { enqueued: results.length, actions: results };
  }
}
