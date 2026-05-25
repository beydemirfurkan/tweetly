import { z } from 'zod';
import { accountId, cursor, limit, listIdField, tweetUrl, verifiedOnly, xHandle } from './common';

export const searchTweets = z.object({
  query: z.string().min(1).describe('Search query (X advanced operators supported)'),
  limit: limit(50),
  account_id: accountId,
  cursor,
});
export const getUser = z.object({
  handle: xHandle.describe('Handle of the user to fetch'),
  account_id: accountId,
});
export const getTweet = z.object({
  tweet_url: tweetUrl.describe('URL of the tweet to fetch'),
  account_id: accountId,
});
export const getUserTweets = z.object({
  handle: xHandle.describe('Handle of the user whose tweets to fetch'),
  limit: limit(50),
  account_id: accountId,
  cursor,
});
export const searchUsers = z.object({
  query: z.string().min(1).describe('Search query for users (name or handle)'),
  limit: limit(50),
  account_id: accountId,
  verified_only: verifiedOnly,
  cursor,
});
export const getUserFollowers = z.object({
  handle: xHandle.describe('Handle whose followers to list'),
  limit: limit(200),
  account_id: accountId,
  verified_only: verifiedOnly,
  cursor,
});
export const getUserFollowing = z.object({
  handle: xHandle.describe('Handle whose following list to fetch'),
  limit: limit(200),
  account_id: accountId,
  verified_only: verifiedOnly,
  cursor,
});
export const getTweetRetweeters = z.object({
  tweet_url: z.string().min(1).describe('URL of the tweet whose retweeters to list'),
  limit: limit(200),
  account_id: accountId,
  verified_only: verifiedOnly,
  cursor,
});
export const getTweetQuotes = z.object({
  tweet_url: z.string().min(1).describe('URL of the tweet whose quote tweets to list'),
  limit: limit(50),
  account_id: accountId,
  cursor,
});
export const getTweetReplies = z.object({
  tweet_url: z.string().min(1).describe('URL of the tweet whose replies to list'),
  limit: limit(50),
  account_id: accountId,
  cursor,
});
export const getUserMentions = z.object({
  handle: xHandle.describe('Handle whose mentions to search for'),
  limit: limit(50),
  account_id: accountId,
  cursor,
});
export const getXTrending = z.object({ account_id: accountId });

export const getUserLikes = z.object({
  handle: xHandle.describe('Handle whose liked tweets to fetch'),
  limit: limit(50),
  account_id: accountId,
  cursor,
});
export const getMyBookmarks = z.object({
  limit: limit(50),
  account_id: accountId,
  cursor,
});
export const getListMembers = z.object({
  list_id: listIdField,
  limit: limit(200),
  account_id: accountId,
  verified_only: verifiedOnly,
  cursor,
});
export const getMutualFollowers = z.object({
  handle: xHandle.describe('Handle whose mutual followers to compute'),
  limit: limit(200),
  account_id: accountId,
  verified_only: verifiedOnly,
  cursor,
});
export const getUserLists = z.object({
  handle: xHandle.describe('Handle whose owned lists to fetch'),
  account_id: accountId,
});
export const getList = z.object({
  list_id: listIdField,
  account_id: accountId,
});
export const getListSubscribers = z.object({
  list_id: listIdField,
  limit: limit(200),
  account_id: accountId,
  verified_only: verifiedOnly,
  cursor,
});
export const getThread = z.object({
  tweet_url: tweetUrl.describe('URL of the root tweet of the thread'),
  limit: limit(50),
  account_id: accountId,
});
