import type { ActionStatus } from '@domain/types/action.types';

export interface BaseClaimedActionFields {
  id: string;
  status: ActionStatus;
  account_id: string;
  attempts: number;
  max_attempts: number;
  scheduled_at: Date;
  metadata: Record<string, unknown>;
  idempotency_key: string;
  parent_action_ref: string | null;
}

export interface ClaimedPostRow extends BaseClaimedActionFields {
  type: 'post';
  text: string;
  media_path: string | null;
  media_paths: string[] | null;
  alt_texts: string[] | null;
}

export interface ClaimedReplyRow extends BaseClaimedActionFields {
  type: 'reply';
  text: string;
  parent_tweet_url: string;
}

export interface ClaimedQuoteRow extends BaseClaimedActionFields {
  type: 'quote';
  text: string;
  target_tweet_url: string;
}

export type TweetEngagementType = 'like' | 'retweet' | 'bookmark' | 'unlike' | 'unretweet' | 'delete_tweet';

export interface ClaimedTweetEngagementRow extends BaseClaimedActionFields {
  type: TweetEngagementType;
  target_tweet_url: string;
}

export type FollowEngagementType = 'follow' | 'unfollow';

export interface ClaimedFollowRow extends BaseClaimedActionFields {
  type: FollowEngagementType;
  target_handle: string;
}

export interface ClaimedDmRow extends BaseClaimedActionFields {
  type: 'dm';
  target_handle: string;
  message: string;
}

export interface ClaimedProfileUpdateRow extends BaseClaimedActionFields {
  type: 'profile_update';
  fields: Record<string, unknown>;
}

export type ProfileImageType = 'avatar_update' | 'banner_update';

export interface ClaimedProfileImageRow extends BaseClaimedActionFields {
  type: ProfileImageType;
  file_path: string;
}

export type ClaimedActionRow =
  | ClaimedPostRow
  | ClaimedReplyRow
  | ClaimedQuoteRow
  | ClaimedTweetEngagementRow
  | ClaimedFollowRow
  | ClaimedDmRow
  | ClaimedProfileUpdateRow
  | ClaimedProfileImageRow;

export function assertRowType<T extends ClaimedActionRow['type']>(
  row: ClaimedActionRow,
  expected: T | readonly T[],
): asserts row is Extract<ClaimedActionRow, { type: T }> {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(row.type as T)) {
    throw new Error(`Expected action row type ${allowed.join('|')}, got ${row.type}`);
  }
}
