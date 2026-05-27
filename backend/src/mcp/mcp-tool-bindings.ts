import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { McpRouter, type McpToolInvoker } from './mcp-router.service';
import type { ToolName } from './handlers/tool-schemas';
import { WriteHandler } from './handlers/write.handler';
import { ProfileHandler } from './handlers/profile.handler';
import { ReadHandler } from './handlers/read.handler';
import { MonitorHandler } from './handlers/monitor.handler';
import { AccountHandler } from './handlers/account.handler';
import { ExtractionHandler } from './handlers/extraction.handler';

/**
 * Single source of truth for tool-name → handler-method routing. Typed as
 * `Record<ToolName, ...>` so adding a tool to TOOL_SCHEMAS without binding
 * it here fails the build — no runtime drift possible.
 */
@Injectable()
export class McpToolBindings implements OnApplicationBootstrap {
  constructor(
    private readonly router: McpRouter,
    private readonly write: WriteHandler,
    private readonly profile: ProfileHandler,
    private readonly read: ReadHandler,
    private readonly monitor: MonitorHandler,
    private readonly account: AccountHandler,
    private readonly extraction: ExtractionHandler,
  ) {}

  onApplicationBootstrap(): void {
    const w = this.write;
    const p = this.profile;
    const r = this.read;
    const m = this.monitor;
    const a = this.account;
    const e = this.extraction;

    const bindings: Record<ToolName, McpToolInvoker> = {
      // Queue-backed writes
      post_tweet: (args, ctx) => w.postTweet(args, ctx),
      reply_to_tweet: (args, ctx) => w.replyToTweet(args, ctx),
      like_tweet: (args, ctx) => w.likeTweet(args, ctx),
      retweet_tweet: (args, ctx) => w.retweet(args, ctx),
      quote_tweet: (args, ctx) => w.quoteTweet(args, ctx),
      bookmark_tweet: (args, ctx) => w.bookmarkTweet(args, ctx),
      follow_account: (args, ctx) => w.followAccount(args, ctx),
      post_thread: (args, ctx) => w.postThread(args, ctx),

      // Queue-backed writes (formerly synchronous via XDirectService).
      unlike_tweet: (args, ctx) => p.unlikeTweet(args, ctx),
      unretweet_tweet: (args, ctx) => p.unretweet(args, ctx),
      unfollow_account: (args, ctx) => p.unfollowAccount(args, ctx),
      delete_tweet: (args, ctx) => p.deleteTweet(args, ctx),
      send_dm: (args, ctx) => p.sendDm(args, ctx),
      update_profile: (args, ctx) => p.updateProfile(args, ctx),
      update_avatar: (args, ctx) => p.updateAvatar(args, ctx),
      update_banner: (args, ctx) => p.updateBanner(args, ctx),

      // Reads
      search_tweets: (args, ctx) => r.searchTweets(args, ctx),
      get_user: (args, ctx) => r.getUser(args, ctx),
      get_tweet: (args, ctx) => r.getTweet(args, ctx),
      get_user_tweets: (args, ctx) => r.getUserTweets(args, ctx),
      search_users: (args, ctx) => r.searchUsers(args, ctx),
      get_user_followers: (args, ctx) => r.getUserFollowers(args, ctx),
      get_user_following: (args, ctx) => r.getUserFollowing(args, ctx),
      get_tweet_retweeters: (args, ctx) => r.getTweetRetweeters(args, ctx),
      get_tweet_quotes: (args, ctx) => r.getTweetQuotes(args, ctx),
      get_tweet_replies: (args, ctx) => r.getTweetReplies(args, ctx),
      get_user_mentions: (args, ctx) => r.getUserMentions(args, ctx),
      get_x_trending: (args, ctx) => r.getXTrending(args, ctx),
      get_user_likes: (args, ctx) => r.getUserLikes(args, ctx),
      get_my_bookmarks: (args, ctx) => r.getMyBookmarks(args, ctx),
      get_list_members: (args, ctx) => r.getListMembers(args, ctx),
      get_mutual_followers: (args, ctx) => r.getMutualFollowers(args, ctx),
      get_thread: (args, ctx) => r.getThread(args, ctx),
      get_user_lists: (args, ctx) => r.getUserLists(args, ctx),
      get_list: (args, ctx) => r.getList(args, ctx),
      get_list_subscribers: (args, ctx) => r.getListSubscribers(args, ctx),

      // Monitors
      create_monitor: (args, ctx) => m.createMonitor(args, ctx),
      list_monitors: (args, ctx) => m.listMonitors(args, ctx),
      get_monitor: (args, ctx) => m.getMonitor(args, ctx),
      rotate_secret: (args, ctx) => m.rotateSecret(args, ctx),
      delete_monitor: (args, ctx) => m.deleteMonitor(args, ctx),
      pause_monitor: (args, ctx) => m.pauseMonitor(args, ctx),

      // Extractions
      create_extraction: (args, ctx) => e.createExtraction(args, ctx),
      get_extraction: (args, ctx) => e.getExtraction(args, ctx),
      list_extractions: (args, ctx) => e.listExtractions(args, ctx),
      cancel_extraction: (args, ctx) => e.cancelExtraction(args, ctx),

      // Accounts, login, action queue, settings
      get_accounts: (args, ctx) => a.getAccounts(args, ctx),
      get_account_health: (args, ctx) => a.getAccountHealth(args, ctx),
      connect_x_account: (args, ctx) => a.connectXAccount(args, ctx),
      reauth_x_account: (args, ctx) => a.reauthXAccount(args, ctx),
      get_x_login_job: (args, ctx) => a.getXLoginJob(args, ctx),
      list_actions: (args, ctx) => a.listActions(args, ctx),
      cancel_action: (args, ctx) => a.cancelAction(args, ctx),
      replay_action: (args, ctx) => a.replayAction(args, ctx),
      get_settings: (args, ctx) => a.getSettings(args, ctx),
      update_settings: (args, ctx) => a.updateSettings(args, ctx),
    };

    for (const name of Object.keys(bindings) as ToolName[]) {
      this.router.register(name, bindings[name]);
    }
  }
}
