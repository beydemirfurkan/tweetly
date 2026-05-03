import { z } from 'zod';
import { ACTION_TYPES, ACTION_STATUSES } from '@domain/types/action.types';

/**
 * Zod runtime schemas for every MCP tool's arguments. The JSON Schemas in
 * tool-definitions.ts are what the MCP client sees; these Zods are what the
 * server enforces before any handler runs. The drift spec ensures the two
 * lists never go out of sync.
 *
 * Common primitives are factored out so a tweet_url tightening (or a handle
 * regex tweak) hits every tool that uses it.
 */

const tweetUrl = z
  .string()
  .min(1)
  .regex(/\/status\/\d+/, 'tweet_url must contain /status/');

// X handles: 1–15 chars, [A-Za-z0-9_]. Allow an optional leading @ — the
// transformer strips it so handlers see a canonical form.
const xHandle = z
  .string()
  .trim()
  .transform((s) => s.replace(/^@/, ''))
  .pipe(z.string().min(1).max(15).regex(/^[A-Za-z0-9_]+$/, 'invalid handle'));

const accountId = z.string().min(1).optional();

const limit = (max: number) => z.number().int().min(1).max(max).optional();

const monitorId = z.string().min(1);

const filePath = z.string().min(1);

// ── Write tools (queue-backed, original 8) ──────────────────────────────

const postTweet = z.object({
  text: z.string().min(1).max(800),
  account_id: accountId,
  media_path: z.string().optional(),
  media_paths: z.array(z.string()).max(4).optional(),
  alt_texts: z.array(z.string()).optional(),
});

const replyToTweet = z.object({
  text: z.string().min(1),
  parent_tweet_url: tweetUrl,
  account_id: accountId,
});

const likeTweet = z.object({ tweet_url: tweetUrl, account_id: accountId });
const retweetTweet = z.object({ tweet_url: tweetUrl, account_id: accountId });
const bookmarkTweet = z.object({ tweet_url: tweetUrl, account_id: accountId });
const quoteTweet = z.object({
  text: z.string().min(1),
  tweet_url: tweetUrl,
  account_id: accountId,
});
const followAccount = z.object({ target_handle: xHandle, account_id: accountId });
const postThread = z.object({
  tweets: z.array(z.string().min(1)).min(1),
  account_id: accountId,
});

// ── Write tools (queue-backed, sprint-added 8) ──────────────────────────

const unlikeTweet = z.object({ tweet_url: tweetUrl, account_id: accountId });
const unretweetTweet = z.object({ tweet_url: tweetUrl, account_id: accountId });
const unfollowAccount = z.object({ target_handle: xHandle, account_id: accountId });
const deleteTweet = z.object({ tweet_url: tweetUrl, account_id: accountId });
const sendDm = z.object({
  target_handle: xHandle,
  message: z.string().min(1),
  account_id: accountId,
});
const updateProfile = z
  .object({
    name: z.string().optional(),
    bio: z.string().optional(),
    location: z.string().optional(),
    website: z.string().optional(),
    account_id: accountId,
  })
  .refine(
    (v) =>
      v.name !== undefined || v.bio !== undefined || v.location !== undefined || v.website !== undefined,
    { message: 'at least one of name, bio, location, website is required' },
  );
const updateAvatar = z.object({ file_path: filePath, account_id: accountId });
const updateBanner = z.object({ file_path: filePath, account_id: accountId });

// ── Read tools ───────────────────────────────────────────────────────────

const searchTweets = z.object({
  query: z.string().min(1),
  limit: limit(50),
  account_id: accountId,
});
const getUser = z.object({ handle: xHandle, account_id: accountId });
const getTweet = z.object({ tweet_url: tweetUrl, account_id: accountId });
const getUserTweets = z.object({
  handle: xHandle,
  limit: limit(50),
  account_id: accountId,
});
const searchUsers = z.object({
  query: z.string().min(1),
  limit: limit(50),
  account_id: accountId,
  verified_only: z.boolean().optional(),
});
const getUserFollowers = z.object({
  handle: xHandle,
  limit: limit(200),
  account_id: accountId,
  verified_only: z.boolean().optional(),
});
const getUserFollowing = z.object({
  handle: xHandle,
  limit: limit(200),
  account_id: accountId,
  verified_only: z.boolean().optional(),
});
const getTweetRetweeters = z.object({
  tweet_url: z.string().min(1),
  limit: limit(200),
  account_id: accountId,
  verified_only: z.boolean().optional(),
});
const getTweetQuotes = z.object({
  tweet_url: z.string().min(1),
  limit: limit(50),
  account_id: accountId,
});
const getTweetReplies = z.object({
  tweet_url: z.string().min(1),
  limit: limit(50),
  account_id: accountId,
});
const getUserMentions = z.object({
  handle: xHandle,
  limit: limit(50),
  account_id: accountId,
});
const getXTrending = z.object({ account_id: accountId });

// ── Monitor tools ───────────────────────────────────────────────────────

const createMonitor = z.object({
  target_handle: xHandle,
  webhook_url: z
    .url()
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
      message: 'webhook_url must be a valid HTTP/HTTPS URL',
    }),
  account_id: accountId,
  event_types: z.array(z.literal('tweet.new')).optional(),
});
const listMonitors = z.object({}).strict();
const getMonitor = z.object({ monitor_id: monitorId });
const deleteMonitor = z.object({ monitor_id: monitorId });
const pauseMonitor = z.object({ monitor_id: monitorId });

// ── Account / login / actions / settings ────────────────────────────────

const getAccounts = z.object({}).strict();
const getAccountHealth = z.object({ account_id: accountId });

// Base32 RFC4648 alphabet, padding optional. Must be at least 16 chars
// (the 80-bit minimum for TOTP).
const base32Secret = z
  .string()
  .trim()
  .regex(/^[A-Z2-7]+=*$/, 'totp_secret must be base32 (RFC4648)')
  .refine((s) => s.replace(/=+$/, '').length >= 16, {
    message: 'totp_secret too short (need 16+ base32 chars)',
  });

const connectXAccount = z.object({
  username: z.string().trim().min(1).transform((s) => s.replace(/^@/, '').toLowerCase()),
  email: z.email().optional(),
  password: z.string().min(1),
  totp_secret: base32Secret.optional(),
  save_totp_secret: z.boolean().optional(),
});
const reauthXAccount = z.object({
  account_id: z.string().min(1),
  password: z.string().min(1),
  totp_secret: base32Secret.optional(),
  save_totp_secret: z.boolean().optional(),
  email: z.email().optional(),
});
const getXLoginJob = z.object({ job_id: z.string().min(1) });

const listActions = z.object({
  type: z.enum(ACTION_TYPES as readonly [string, ...string[]]),
  status: z.enum(ACTION_STATUSES as readonly [string, ...string[]]).optional(),
  account_id: accountId,
  limit: z.number().int().min(1).max(200).optional(),
});
const cancelAction = z.object({
  type: z.enum(ACTION_TYPES as readonly [string, ...string[]]),
  action_id: z.string().min(1),
});
const replayAction = z.object({
  type: z.enum(ACTION_TYPES as readonly [string, ...string[]]),
  action_id: z.string().min(1),
});

const getSettings = z.object({ account_id: z.string().min(1) });
const updateSettings = z.object({
  settings: z.record(z.string(), z.unknown()),
  account_id: z.string().min(1),
});

// ── Registry ────────────────────────────────────────────────────────────

export const TOOL_SCHEMAS = {
  post_tweet: postTweet,
  reply_to_tweet: replyToTweet,
  like_tweet: likeTweet,
  retweet_tweet: retweetTweet,
  quote_tweet: quoteTweet,
  bookmark_tweet: bookmarkTweet,
  follow_account: followAccount,
  post_thread: postThread,

  unlike_tweet: unlikeTweet,
  unretweet_tweet: unretweetTweet,
  unfollow_account: unfollowAccount,
  delete_tweet: deleteTweet,
  send_dm: sendDm,
  update_profile: updateProfile,
  update_avatar: updateAvatar,
  update_banner: updateBanner,

  search_tweets: searchTweets,
  get_user: getUser,
  get_tweet: getTweet,
  get_user_tweets: getUserTweets,
  search_users: searchUsers,
  get_user_followers: getUserFollowers,
  get_user_following: getUserFollowing,
  get_tweet_retweeters: getTweetRetweeters,
  get_tweet_quotes: getTweetQuotes,
  get_tweet_replies: getTweetReplies,
  get_user_mentions: getUserMentions,
  get_x_trending: getXTrending,

  create_monitor: createMonitor,
  list_monitors: listMonitors,
  get_monitor: getMonitor,
  delete_monitor: deleteMonitor,
  pause_monitor: pauseMonitor,

  get_accounts: getAccounts,
  get_account_health: getAccountHealth,
  connect_x_account: connectXAccount,
  reauth_x_account: reauthXAccount,
  get_x_login_job: getXLoginJob,
  list_actions: listActions,
  cancel_action: cancelAction,
  replay_action: replayAction,
  get_settings: getSettings,
  update_settings: updateSettings,
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
