import { z } from 'zod';
import { ACTION_TYPES, ACTION_STATUSES } from '@domain/types/action.types';

/**
 * Zod runtime schemas for every MCP tool's arguments.
 *
 * Single source of truth for both runtime validation AND the JSON Schemas
 * exposed to MCP clients — `tool-definitions.ts` derives those at module
 * load via zod-to-json-schema. Field descriptions live here as `.describe()`
 * calls so they show up in the JSON Schema output without manual sync.
 *
 * Common primitives are factored out so a tweet_url tightening (or a handle
 * regex tweak) hits every tool that uses it, AND the description shared
 * across N tools is owned by one definition.
 */

const tweetUrl = z
  .string()
  .min(1)
  .regex(/\/status\/\d+/, 'tweet_url must contain /status/')
  .describe('Tweet URL (must contain /status/)');

// X handles: 1–15 chars, [A-Za-z0-9_]. Allow an optional leading @ — the
// transformer strips it so handlers see a canonical form.
const xHandle = z
  .string()
  .trim()
  .transform((s) => s.replace(/^@/, ''))
  .pipe(z.string().min(1).max(15).regex(/^[A-Za-z0-9_]+$/, 'invalid handle'))
  .describe('X handle (without leading @)');

const accountId = z
  .string()
  .min(1)
  .optional()
  .describe('Account ID (uses first active account if omitted)');

const limit = (max: number, defaultDescription = `Max items to return (1–${max})`) =>
  z.number().int().min(1).max(max).optional().describe(defaultDescription);

const monitorId = z.string().min(1).describe('Monitor ID');

const filePath = z.string().min(1).describe('Local file path');

const verifiedOnly = z.boolean().optional().describe('Filter to verified accounts only');

const cursor = z
  .string()
  .min(1)
  .optional()
  .describe('Opaque cursor from a previous response (echo nextCursor verbatim)');

// ── Write tools (queue-backed, original 8) ──────────────────────────────

const postTweet = z.object({
  text: z.string().min(1).max(800).describe('Tweet text (max 280 chars displayed; long-form up to 800)'),
  account_id: accountId,
  media_path: z.string().optional().describe('Single-file convenience; prefer media_paths'),
  media_paths: z
    .array(z.string())
    .max(4)
    .optional()
    .describe('Local file paths. Up to 4 images, or 1 video, or 1 GIF.'),
  alt_texts: z
    .array(z.string())
    .optional()
    .describe('Per-media accessibility text (best-effort, index-aligned with media_paths).'),
});

const replyToTweet = z.object({
  text: z.string().min(1).describe('Reply text'),
  parent_tweet_url: tweetUrl.describe('URL of the tweet to reply to (must contain /status/)'),
  account_id: accountId,
});

const likeTweet = z.object({
  tweet_url: tweetUrl.describe('URL of the tweet to like (must contain /status/)'),
  account_id: accountId,
});
const retweetTweet = z.object({
  tweet_url: tweetUrl.describe('URL of the tweet to retweet (must contain /status/)'),
  account_id: accountId,
});
const bookmarkTweet = z.object({
  tweet_url: tweetUrl.describe('URL of the tweet to bookmark (must contain /status/)'),
  account_id: accountId,
});
const quoteTweet = z.object({
  text: z.string().min(1).describe('Your comment text'),
  tweet_url: tweetUrl.describe('URL of the tweet to quote (must contain /status/)'),
  account_id: accountId,
});
const followAccount = z.object({
  target_handle: xHandle.describe('Handle of the account to follow (without @)'),
  account_id: accountId,
});
const postThread = z.object({
  tweets: z.array(z.string().min(1)).min(1).describe('Tweet texts in order; posted with 5s spacing'),
  account_id: accountId,
});

// ── Write tools (queue-backed, sprint-added 8) ──────────────────────────

const unlikeTweet = z.object({
  tweet_url: tweetUrl.describe('URL of the tweet to unlike'),
  account_id: accountId,
});
const unretweetTweet = z.object({
  tweet_url: tweetUrl.describe('URL of the tweet to undo retweet for'),
  account_id: accountId,
});
const unfollowAccount = z.object({
  target_handle: xHandle.describe('Handle of the account to unfollow'),
  account_id: accountId,
});
const deleteTweet = z.object({
  tweet_url: tweetUrl.describe('URL of YOUR tweet to delete'),
  account_id: accountId,
});
const sendDm = z.object({
  target_handle: xHandle.describe('Handle of the account to DM'),
  message: z.string().min(1).describe('Message text'),
  account_id: accountId,
});
const updateProfile = z
  .object({
    name: z.string().optional().describe('Display name (50 char max)'),
    bio: z.string().optional().describe('Bio (160 char max)'),
    location: z.string().optional().describe('Location string'),
    website: z.string().optional().describe('Website URL'),
    account_id: accountId,
  })
  .refine(
    (v) =>
      v.name !== undefined || v.bio !== undefined || v.location !== undefined || v.website !== undefined,
    { message: 'at least one of name, bio, location, website is required' },
  );
const updateAvatar = z.object({
  file_path: filePath.describe('Local image file (jpg/png) for avatar'),
  account_id: accountId,
});
const updateBanner = z.object({
  file_path: filePath.describe('Local image file (jpg/png) for banner'),
  account_id: accountId,
});

// ── Read tools ───────────────────────────────────────────────────────────

const searchTweets = z.object({
  query: z.string().min(1).describe('Search query (X advanced operators supported)'),
  limit: limit(50),
  account_id: accountId,
  cursor,
});
const getUser = z.object({
  handle: xHandle.describe('Handle of the user to fetch'),
  account_id: accountId,
});
const getTweet = z.object({
  tweet_url: tweetUrl.describe('URL of the tweet to fetch'),
  account_id: accountId,
});
const getUserTweets = z.object({
  handle: xHandle.describe('Handle of the user whose tweets to fetch'),
  limit: limit(50),
  account_id: accountId,
  cursor,
});
const searchUsers = z.object({
  query: z.string().min(1).describe('Search query for users (name or handle)'),
  limit: limit(50),
  account_id: accountId,
  verified_only: verifiedOnly,
  cursor,
});
const getUserFollowers = z.object({
  handle: xHandle.describe('Handle whose followers to list'),
  limit: limit(200),
  account_id: accountId,
  verified_only: verifiedOnly,
  cursor,
});
const getUserFollowing = z.object({
  handle: xHandle.describe('Handle whose following list to fetch'),
  limit: limit(200),
  account_id: accountId,
  verified_only: verifiedOnly,
  cursor,
});
const getTweetRetweeters = z.object({
  tweet_url: z.string().min(1).describe('URL of the tweet whose retweeters to list'),
  limit: limit(200),
  account_id: accountId,
  verified_only: verifiedOnly,
  cursor,
});
const getTweetQuotes = z.object({
  tweet_url: z.string().min(1).describe('URL of the tweet whose quote tweets to list'),
  limit: limit(50),
  account_id: accountId,
  cursor,
});
const getTweetReplies = z.object({
  tweet_url: z.string().min(1).describe('URL of the tweet whose replies to list'),
  limit: limit(50),
  account_id: accountId,
  cursor,
});
const getUserMentions = z.object({
  handle: xHandle.describe('Handle whose mentions to search for'),
  limit: limit(50),
  account_id: accountId,
  cursor,
});
const getXTrending = z.object({ account_id: accountId });

const getUserLikes = z.object({
  handle: xHandle.describe('Handle whose liked tweets to fetch'),
  limit: limit(50),
  account_id: accountId,
  cursor,
});
const getMyBookmarks = z.object({
  limit: limit(50),
  account_id: accountId,
  cursor,
});
const getListMembers = z.object({
  list_id: z
    .string()
    .regex(/^\d+$/, 'list_id must be numeric')
    .describe('Numeric X list ID'),
  limit: limit(200),
  account_id: accountId,
  verified_only: verifiedOnly,
  cursor,
});
const getMutualFollowers = z.object({
  handle: xHandle.describe('Handle whose mutual followers to compute'),
  limit: limit(200),
  account_id: accountId,
  verified_only: verifiedOnly,
  cursor,
});
const getThread = z.object({
  tweet_url: tweetUrl.describe('URL of the root tweet of the thread'),
  limit: limit(50),
  account_id: accountId,
});

// ── Monitor tools ───────────────────────────────────────────────────────

const createMonitor = z.object({
  target_handle: xHandle.describe('Handle of the account to monitor'),
  webhook_url: z
    .url()
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
      message: 'webhook_url must be a valid HTTP/HTTPS URL',
    })
    .describe('HTTP/HTTPS URL to POST events to'),
  account_id: accountId,
  event_types: z
    .array(z.literal('tweet.new'))
    .optional()
    .describe('Subscribe to specific event types (default: all)'),
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
  })
  .describe('TOTP secret as base32 RFC4648 (16+ chars)');

const connectXAccount = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.replace(/^@/, '').toLowerCase())
    .describe('X username to log in as (with or without leading @)'),
  email: z.email().optional().describe('Recovery email if X prompts for verification'),
  password: z.string().min(1).describe('Password — encrypted at rest, never logged'),
  totp_secret: base32Secret.optional(),
  save_totp_secret: z.boolean().optional().describe('Persist totp_secret encrypted on the account row'),
});
const reauthXAccount = z.object({
  account_id: z.string().min(1).describe('ID of the existing account to re-authenticate'),
  password: z.string().min(1).describe('Fresh password for the same account'),
  totp_secret: base32Secret.optional(),
  save_totp_secret: z.boolean().optional(),
  email: z.email().optional(),
});
const getXLoginJob = z.object({
  job_id: z.string().min(1).describe('Login job ID returned by connect_x_account / reauth_x_account'),
});

const listActions = z.object({
  type: z.enum(ACTION_TYPES as readonly [string, ...string[]]).describe('Action type'),
  status: z
    .enum(ACTION_STATUSES as readonly [string, ...string[]])
    .optional()
    .describe('Filter by status'),
  account_id: accountId,
  limit: z.number().int().min(1).max(200).optional().describe('Max rows (1–200)'),
});
const cancelAction = z.object({
  type: z.enum(ACTION_TYPES as readonly [string, ...string[]]).describe('Action type'),
  action_id: z.string().min(1).describe('Action ID to cancel'),
});
const replayAction = z.object({
  type: z.enum(ACTION_TYPES as readonly [string, ...string[]]).describe('Action type'),
  action_id: z.string().min(1).describe('Action ID to replay (must be dead/failed/cancelled)'),
});

const getSettings = z.object({
  account_id: z.string().min(1).describe('Account ID to fetch settings for'),
});
const updateSettings = z.object({
  settings: z
    .record(z.string(), z.unknown())
    .describe('Key-value map of settings to upsert'),
  account_id: z.string().min(1).describe('Account ID owning the settings'),
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
  get_user_likes: getUserLikes,
  get_my_bookmarks: getMyBookmarks,
  get_list_members: getListMembers,
  get_mutual_followers: getMutualFollowers,
  get_thread: getThread,

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
