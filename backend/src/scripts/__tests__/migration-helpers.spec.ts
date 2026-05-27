import {
  buildPostKey,
  buildReplyKey,
  extractTweetIdFromUrl,
  hourBucket,
  inferActionType,
  parseControlStateKey,
  sha8,
  statusMap,
} from '../migration-helpers';

describe('migration-helpers', () => {
  it('sha8 returns first 8 hex chars', () => {
    expect(sha8('hello')).toMatch(/^[0-9a-f]{8}$/);
    expect(sha8('hello')).toBe(sha8('hello'));
    expect(sha8('hello')).not.toBe(sha8('world'));
  });

  it('hourBucket truncates to YYYY-MM-DDTHH', () => {
    expect(hourBucket('2026-04-28T15:34:21.123Z')).toBe('2026-04-28T15');
  });

  it('statusMap maps sent->succeeded and preserves others', () => {
    expect(statusMap('sent')).toBe('succeeded');
    expect(statusMap('pending')).toBe('pending');
    expect(statusMap('failed')).toBe('failed');
    expect(statusMap('dead')).toBe('dead');
  });

  it('extractTweetIdFromUrl picks numeric id', () => {
    expect(extractTweetIdFromUrl('https://x.com/foo/status/1234567890')).toBe('1234567890');
    expect(extractTweetIdFromUrl(null)).toBeNull();
    expect(extractTweetIdFromUrl('https://x.com/foo')).toBeNull();
  });

  it('buildPostKey produces deterministic prefixed key', () => {
    const k = buildPostKey('alice', 'hello world', '2026-04-28T15:34:21Z');
    expect(k).toMatch(/^post:alice:[0-9a-f]{8}:2026-04-28T15$/);
  });

  it('buildReplyKey includes parent tweet id', () => {
    const k = buildReplyKey('alice', '999', 'reply text');
    expect(k).toMatch(/^reply:alice:999:[0-9a-f]{8}$/);
  });

  it('parseControlStateKey splits accountId prefix', () => {
    expect(parseControlStateKey('alice:paused')).toEqual({ accountId: 'alice', field: 'paused' });
    expect(parseControlStateKey('paused')).toEqual({ accountId: '', field: 'paused' });
  });

  it('inferActionType maps event types', () => {
    expect(inferActionType('post_success')).toBe('post');
    expect(inferActionType('post_failure')).toBe('post');
    expect(inferActionType('reply_success')).toBe('reply');
    expect(inferActionType('thread_complete')).toBeNull();
  });
});
