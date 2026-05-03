import { Injectable } from '@nestjs/common';
import { ActionEnqueueService } from '@/action-engine/action-enqueue.service';
import type { McpToolArgs, McpToolContext } from './mcp-tool.context';

/**
 * Write tools that previously ran synchronously through XDirectService now
 * enqueue actions on the action engine. Every handler returns
 * `{ id, idempotencyKey }` to match the queued response shape used by the
 * other write tools.
 */
@Injectable()
export class ProfileHandler {
  constructor(private readonly enqueue: ActionEnqueueService) {}

  async unlikeTweet(args: McpToolArgs, ctx: McpToolContext) {
    const tweetUrl = args.tweet_url as string;
    if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    return this.enqueue.enqueueUnlike({
      accountId, targetTweetUrl: tweetUrl, scheduledAt: new Date(), metadata: { source: 'mcp' },
    });
  }

  async unretweet(args: McpToolArgs, ctx: McpToolContext) {
    const tweetUrl = args.tweet_url as string;
    if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    return this.enqueue.enqueueUnretweet({
      accountId, targetTweetUrl: tweetUrl, scheduledAt: new Date(), metadata: { source: 'mcp' },
    });
  }

  async unfollowAccount(args: McpToolArgs, ctx: McpToolContext) {
    const targetHandle = args.target_handle as string;
    if (!targetHandle) throw new Error('target_handle is required');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    return this.enqueue.enqueueUnfollow({
      accountId, targetHandle, scheduledAt: new Date(), metadata: { source: 'mcp' },
    });
  }

  async deleteTweet(args: McpToolArgs, ctx: McpToolContext) {
    const tweetUrl = args.tweet_url as string;
    if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    return this.enqueue.enqueueDeleteTweet({
      accountId, targetTweetUrl: tweetUrl, scheduledAt: new Date(), metadata: { source: 'mcp' },
    });
  }

  async sendDm(args: McpToolArgs, ctx: McpToolContext) {
    const targetHandle = args.target_handle as string;
    const message = args.message as string;
    if (!targetHandle) throw new Error('target_handle is required');
    if (!message) throw new Error('message is required');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    return this.enqueue.enqueueDm({
      accountId, targetHandle, message, scheduledAt: new Date(), metadata: { source: 'mcp' },
    });
  }

  async updateProfile(args: McpToolArgs, ctx: McpToolContext) {
    const fields: Record<string, unknown> = {};
    if (args.name !== undefined) fields.name = args.name;
    if (args.bio !== undefined) fields.bio = args.bio;
    if (args.location !== undefined) fields.location = args.location;
    if (args.website !== undefined) fields.website = args.website;
    if (Object.keys(fields).length === 0) {
      throw new Error('At least one of name, bio, location, website is required');
    }
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    return this.enqueue.enqueueProfileUpdate({
      accountId, fields, scheduledAt: new Date(), metadata: { source: 'mcp' },
    });
  }

  async updateAvatar(args: McpToolArgs, ctx: McpToolContext) {
    const filePath = args.file_path as string;
    if (!filePath) throw new Error('file_path is required');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    return this.enqueue.enqueueAvatarUpdate({
      accountId, filePath, scheduledAt: new Date(), metadata: { source: 'mcp' },
    });
  }

  async updateBanner(args: McpToolArgs, ctx: McpToolContext) {
    const filePath = args.file_path as string;
    if (!filePath) throw new Error('file_path is required');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    return this.enqueue.enqueueBannerUpdate({
      accountId, filePath, scheduledAt: new Date(), metadata: { source: 'mcp' },
    });
  }
}
