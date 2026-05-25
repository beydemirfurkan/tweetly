import { z } from 'zod';
import { accountId, filePath, tweetUrl, xHandle } from './common';

// ── Queue-backed write tools (original 8) ───────────────────────────────

export const postTweet = z.object({
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

export const replyToTweet = z.object({
  text: z.string().min(1).describe('Reply text'),
  parent_tweet_url: tweetUrl.describe('URL of the tweet to reply to (must contain /status/)'),
  account_id: accountId,
});

export const likeTweet = z.object({
  tweet_url: tweetUrl.describe('URL of the tweet to like (must contain /status/)'),
  account_id: accountId,
});
export const retweetTweet = z.object({
  tweet_url: tweetUrl.describe('URL of the tweet to retweet (must contain /status/)'),
  account_id: accountId,
});
export const bookmarkTweet = z.object({
  tweet_url: tweetUrl.describe('URL of the tweet to bookmark (must contain /status/)'),
  account_id: accountId,
});
export const quoteTweet = z.object({
  text: z.string().min(1).describe('Your comment text'),
  tweet_url: tweetUrl.describe('URL of the tweet to quote (must contain /status/)'),
  account_id: accountId,
});
export const followAccount = z.object({
  target_handle: xHandle.describe('Handle of the account to follow (without @)'),
  account_id: accountId,
});
export const postThread = z.object({
  tweets: z.array(z.string().min(1)).min(1).describe('Tweet texts in order; posted with 5s spacing'),
  account_id: accountId,
});

// ── Queue-backed write tools (sprint-added 8) ───────────────────────────

export const unlikeTweet = z.object({
  tweet_url: tweetUrl.describe('URL of the tweet to unlike'),
  account_id: accountId,
});
export const unretweetTweet = z.object({
  tweet_url: tweetUrl.describe('URL of the tweet to undo retweet for'),
  account_id: accountId,
});
export const unfollowAccount = z.object({
  target_handle: xHandle.describe('Handle of the account to unfollow'),
  account_id: accountId,
});
export const deleteTweet = z.object({
  tweet_url: tweetUrl.describe('URL of YOUR tweet to delete'),
  account_id: accountId,
});
export const sendDm = z.object({
  target_handle: xHandle.describe('Handle of the account to DM'),
  message: z.string().min(1).describe('Message text'),
  account_id: accountId,
});
export const updateProfile = z
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
export const updateAvatar = z.object({
  file_path: filePath.describe('Local image file (jpg/png) for avatar'),
  account_id: accountId,
});
export const updateBanner = z.object({
  file_path: filePath.describe('Local image file (jpg/png) for banner'),
  account_id: accountId,
});
