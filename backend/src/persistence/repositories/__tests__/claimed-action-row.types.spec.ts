import { ACTION_TYPES, type ActionType } from '@domain/types/action.types';
import { assertRowType, type ClaimedActionRow } from './claimed-action-row.types';

function exhaustivePayloadFor(row: ClaimedActionRow): string {
  switch (row.type) {
    case 'post':
      return `${row.text}|${row.media_path ?? ''}`;
    case 'reply':
      return `${row.text}->${row.parent_tweet_url}`;
    case 'quote':
      return `${row.text}->${row.target_tweet_url}`;
    case 'like':
    case 'retweet':
    case 'bookmark':
    case 'unlike':
    case 'unretweet':
    case 'delete_tweet':
      return row.target_tweet_url;
    case 'follow':
    case 'unfollow':
      return row.target_handle;
    case 'dm':
      return `${row.target_handle}:${row.message}`;
    case 'profile_update':
      return JSON.stringify(row.fields);
    case 'avatar_update':
    case 'banner_update':
      return row.file_path;
    default: {
      const _exhaustive: never = row;
      return _exhaustive;
    }
  }
}

describe('ClaimedActionRow discriminated union', () => {
  it('every ActionType has a discriminated row branch (exhaustiveness drift guard)', () => {
    const all: ClaimedActionRow[] = [
      { type: 'post', id: '1', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, text: 't', media_path: null, media_paths: null, alt_texts: null },
      { type: 'reply', id: '2', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, text: 't', parent_tweet_url: 'https://x.com/u/status/1' },
      { type: 'quote', id: '3', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, text: 'q', target_tweet_url: 'https://x.com/u/status/1' },
      { type: 'like', id: '4', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, target_tweet_url: 'u' },
      { type: 'retweet', id: '5', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, target_tweet_url: 'u' },
      { type: 'bookmark', id: '6', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, target_tweet_url: 'u' },
      { type: 'unlike', id: '7', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, target_tweet_url: 'u' },
      { type: 'unretweet', id: '8', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, target_tweet_url: 'u' },
      { type: 'delete_tweet', id: '9', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, target_tweet_url: 'u' },
      { type: 'follow', id: '10', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, target_handle: 'h' },
      { type: 'unfollow', id: '11', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, target_handle: 'h' },
      { type: 'dm', id: '12', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, target_handle: 'h', message: 'hey' },
      { type: 'profile_update', id: '13', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, fields: { name: 'X' } },
      { type: 'avatar_update', id: '14', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, file_path: '/a.png' },
      { type: 'banner_update', id: '15', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, file_path: '/b.png' },
    ];

    const coveredTypes = new Set<ActionType>(all.map((r) => r.type as ActionType));
    for (const t of ACTION_TYPES) {
      expect(coveredTypes.has(t)).toBe(true);
    }

    for (const row of all) {
      expect(typeof exhaustivePayloadFor(row)).toBe('string');
    }
  });

  it('assertRowType narrows on a single type match', () => {
    const row: ClaimedActionRow = { type: 'post', id: '1', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, text: 'hi', media_path: null, media_paths: null, alt_texts: null };
    assertRowType(row, 'post');
    expect(row.text).toBe('hi');
  });

  it('assertRowType throws on type mismatch', () => {
    const row: ClaimedActionRow = { type: 'like', id: '1', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, target_tweet_url: 'u' };
    expect(() => assertRowType(row, 'post')).toThrow(/Expected action row type post/);
  });

  it('assertRowType accepts an array of allowed types', () => {
    const row: ClaimedActionRow = { type: 'like', id: '1', status: 'pending', account_id: 'a', attempts: 0, max_attempts: 3, scheduled_at: new Date(), metadata: {}, idempotency_key: 'k', parent_action_ref: null, target_tweet_url: 'u' };
    expect(() => assertRowType(row, ['like', 'bookmark'] as const)).not.toThrow();
  });
});
