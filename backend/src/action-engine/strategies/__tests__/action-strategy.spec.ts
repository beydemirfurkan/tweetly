import { IdempotencyKeyService } from '@domain/services/idempotency-key';
import { PostActionStrategy } from '../post.strategy';
import { ReplyActionStrategy } from '../reply.strategy';
import { LikeActionStrategy } from '../like.strategy';
import { UnlikeActionStrategy } from '../unlike.strategy';
import { FollowActionStrategy } from '../follow.strategy';
import { UnfollowActionStrategy } from '../unfollow.strategy';
import { DmActionStrategy } from '../dm.strategy';
import { ProfileUpdateActionStrategy } from '../profile-update.strategy';
import { AvatarUpdateActionStrategy } from '../avatar-update.strategy';
import { QuoteActionStrategy } from '../quote.strategy';

const keys = new IdempotencyKeyService();
const now = new Date('2025-01-01T00:00:00Z');

describe('Action strategies', () => {
  it('post: idempotencyKey + toColumns + toPayload', () => {
    const s = new PostActionStrategy(keys);
    expect(s.type).toBe('post');
    expect(s.tableConfig.table).toBe('post_actions');
    expect(s.idempotencyKey({ accountId: 'a', text: 'hi', scheduledAt: now })).toMatch(/^post:a:/);
    expect(s.toColumns({ accountId: 'a', text: 'hi', scheduledAt: now })).toEqual({
      text: 'hi',
      media_path: null,
      media_paths: null,
      alt_texts: null,
    });
    expect(s.toPayload({ text: 'x', media_path: null, media_paths: null, alt_texts: null } as any)).toEqual({
      text: 'x',
      mediaPath: null,
      mediaPaths: null,
      altTexts: null,
    });
  });

  it('post: collapses mediaPaths[0] into media_path when mediaPath omitted', () => {
    const s = new PostActionStrategy(keys);
    expect(s.toColumns({
      accountId: 'a', text: 't', scheduledAt: now, mediaPaths: ['/p1.png', '/p2.png'], altTexts: ['a', 'b'],
    })).toEqual({
      text: 't',
      media_path: '/p1.png',
      media_paths: ['/p1.png', '/p2.png'],
      alt_texts: ['a', 'b'],
    });
  });

  it('reply: parses tweet id from URL for idempotency key', () => {
    const s = new ReplyActionStrategy(keys);
    expect(s.idempotencyKey({
      accountId: 'a', text: 'r', parentTweetUrl: 'https://x.com/u/status/1234', scheduledAt: now,
    })).toMatch(/^reply:a:1234:/);
  });

  it('reply: throws on invalid tweet URL', () => {
    const s = new ReplyActionStrategy(keys);
    expect(() => s.idempotencyKey({
      accountId: 'a', text: 'r', parentTweetUrl: 'https://x.com/u', scheduledAt: now,
    })).toThrow(/Invalid tweet URL/);
  });

  it('quote: parses tweet id from target URL', () => {
    const s = new QuoteActionStrategy(keys);
    expect(s.idempotencyKey({
      accountId: 'a', text: 'q', targetTweetUrl: 'https://x.com/u/status/9876', scheduledAt: now,
    })).toMatch(/^quote:a:9876:/);
  });

  it('like vs unlike: camelCase payload for like, snake_case for unlike', () => {
    const like = new LikeActionStrategy(keys);
    const unlike = new UnlikeActionStrategy(keys);
    expect(like.toPayload({ target_tweet_url: 'u' } as any)).toEqual({ targetTweetUrl: 'u' });
    expect(unlike.toPayload({ target_tweet_url: 'u' } as any)).toEqual({ target_tweet_url: 'u' });
  });

  it('follow vs unfollow: camelCase / snake_case payload split', () => {
    const follow = new FollowActionStrategy(keys);
    const unfollow = new UnfollowActionStrategy(keys);
    expect(follow.toPayload({ target_handle: 'h' } as any)).toEqual({ targetHandle: 'h' });
    expect(unfollow.toPayload({ target_handle: 'h' } as any)).toEqual({ target_handle: 'h' });
  });

  it('dm: snake_case payload with target_handle + message', () => {
    const s = new DmActionStrategy(keys);
    expect(s.toPayload({ target_handle: 'h', message: 'hey' } as any)).toEqual({
      target_handle: 'h',
      message: 'hey',
    });
  });

  it('profile_update: serializes fields to JSON string in columns', () => {
    const s = new ProfileUpdateActionStrategy(keys);
    const cols = s.toColumns({ accountId: 'a', fields: { name: 'Foo' }, scheduledAt: now });
    expect(cols).toEqual({ fields: JSON.stringify({ name: 'Foo' }) });
  });

  it('avatar_update: passes filePath as file_path column', () => {
    const s = new AvatarUpdateActionStrategy(keys);
    expect(s.toColumns({ accountId: 'a', filePath: '/img.png', scheduledAt: now })).toEqual({
      file_path: '/img.png',
    });
    expect(s.idempotencyKey({ accountId: 'a', filePath: '/img.png', scheduledAt: now })).toMatch(/^avatar_update:a:/);
  });
});
