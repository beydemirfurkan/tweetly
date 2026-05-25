import { z } from 'zod';
import { accountId, limit } from './common';

const extractionType = z
  .enum([
    'user_followers',
    'user_following',
    'user_tweets',
    'user_likes',
    'user_mentions',
    'tweet_retweeters',
    'search_tweets',
    'list_members',
  ])
  .describe('Which read endpoint to drive in the cursor loop');

const extractionParams = z
  .object({
    handle: z.string().optional().describe('User handle (without @) — for user_* extractors'),
    tweet_url: z.string().optional().describe('Tweet URL — for tweet_retweeters'),
    list_id: z.string().optional().describe('Numeric list ID — for list_members'),
    query: z.string().optional().describe('Search query — for search_tweets'),
    verified_only: z.boolean().optional().describe('Filter to verified accounts in user-list extractors'),
  })
  .describe('Type-specific parameters; only one of handle/tweet_url/list_id/query is required per type');

export const createExtraction = z.object({
  type: extractionType,
  params: extractionParams,
  max_rows: z
    .number()
    .int()
    .min(1)
    .max(100_000)
    .optional()
    .describe('Hard cap on rows extracted (1–100000). Default 1000.'),
  account_id: accountId,
});

export const getExtraction = z.object({
  job_id: z.string().min(1).describe('Extraction job ID returned by create_extraction'),
});

export const listExtractions = z.object({
  limit: limit(100).describe('Max number of recent jobs to return (1–100)'),
});

export const cancelExtraction = z.object({
  job_id: z.string().min(1).describe('Extraction job ID to cancel'),
});
