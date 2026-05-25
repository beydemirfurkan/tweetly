import type { z } from 'zod';
import * as write from './write';
import * as read from './read';
import * as extraction from './extraction';
import * as monitor from './monitor';
import * as account from './account';

/**
 * Zod runtime schemas for every MCP tool's arguments.
 *
 * Single source of truth for both runtime validation AND the JSON Schemas
 * exposed to MCP clients — `tool-definitions.ts` derives those at module
 * load via zod-to-json-schema. Field descriptions live on each schema's
 * `.describe()` calls so they show up in the JSON Schema output without
 * manual sync.
 *
 * Schemas are grouped under `./tool-schemas/` by tool category
 * (common / write / read / extraction / monitor / account). This file
 * stitches them into the snake_case-keyed TOOL_SCHEMAS registry.
 */
export const TOOL_SCHEMAS = {
  post_tweet: write.postTweet,
  reply_to_tweet: write.replyToTweet,
  like_tweet: write.likeTweet,
  retweet_tweet: write.retweetTweet,
  quote_tweet: write.quoteTweet,
  bookmark_tweet: write.bookmarkTweet,
  follow_account: write.followAccount,
  post_thread: write.postThread,

  unlike_tweet: write.unlikeTweet,
  unretweet_tweet: write.unretweetTweet,
  unfollow_account: write.unfollowAccount,
  delete_tweet: write.deleteTweet,
  send_dm: write.sendDm,
  update_profile: write.updateProfile,
  update_avatar: write.updateAvatar,
  update_banner: write.updateBanner,

  search_tweets: read.searchTweets,
  get_user: read.getUser,
  get_tweet: read.getTweet,
  get_user_tweets: read.getUserTweets,
  search_users: read.searchUsers,
  get_user_followers: read.getUserFollowers,
  get_user_following: read.getUserFollowing,
  get_tweet_retweeters: read.getTweetRetweeters,
  get_tweet_quotes: read.getTweetQuotes,
  get_tweet_replies: read.getTweetReplies,
  get_user_mentions: read.getUserMentions,
  get_x_trending: read.getXTrending,
  get_user_likes: read.getUserLikes,
  get_my_bookmarks: read.getMyBookmarks,
  get_list_members: read.getListMembers,
  get_mutual_followers: read.getMutualFollowers,
  get_thread: read.getThread,
  get_user_lists: read.getUserLists,
  get_list: read.getList,
  get_list_subscribers: read.getListSubscribers,

  create_monitor: monitor.createMonitor,
  list_monitors: monitor.listMonitors,
  get_monitor: monitor.getMonitor,
  rotate_secret: monitor.rotateSecret,
  delete_monitor: monitor.deleteMonitor,
  pause_monitor: monitor.pauseMonitor,

  create_extraction: extraction.createExtraction,
  get_extraction: extraction.getExtraction,
  list_extractions: extraction.listExtractions,
  cancel_extraction: extraction.cancelExtraction,

  get_accounts: account.getAccounts,
  get_account_health: account.getAccountHealth,
  connect_x_account: account.connectXAccount,
  reauth_x_account: account.reauthXAccount,
  get_x_login_job: account.getXLoginJob,
  list_actions: account.listActions,
  cancel_action: account.cancelAction,
  replay_action: account.replayAction,
  get_settings: account.getSettings,
  update_settings: account.updateSettings,
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;
export type ToolArgs<T extends ToolName> = z.infer<(typeof TOOL_SCHEMAS)[T]>;

/**
 * Format a ZodError into a single-line message for the MCP `Error: …`
 * response. Each issue becomes `path: message`, joined by `; `.
 */
export function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((i) => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    })
    .join('; ');
}
