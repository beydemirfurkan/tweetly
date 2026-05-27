import { WriteHandler } from './write.handler';
import { fakeContext } from './__tests__/test-helpers';
import type { ActionEnqueueService } from '@/action-engine/action-enqueue.service';

function mockEnqueue(): jest.Mocked<ActionEnqueueService> {
  const r = (id = 'a-1', key = 'k-1') => Promise.resolve({ id, idempotencyKey: key });
  return {
    enqueuePost: jest.fn().mockReturnValue(r()),
    enqueueReply: jest.fn().mockReturnValue(r()),
    enqueueLike: jest.fn().mockReturnValue(r()),
    enqueueRetweet: jest.fn().mockReturnValue(r()),
    enqueueQuote: jest.fn().mockReturnValue(r()),
    enqueueBookmark: jest.fn().mockReturnValue(r()),
    enqueueFollow: jest.fn().mockReturnValue(r()),
  } as unknown as jest.Mocked<ActionEnqueueService>;
}

describe('WriteHandler', () => {
  describe('postTweet', () => {
    it('throws when text is missing', async () => {
      const h = new WriteHandler(mockEnqueue());
      await expect(h.postTweet({}, fakeContext())).rejects.toThrow(/text is required/);
    });

    it('rejects more than 4 media_paths (X composer constraint)', async () => {
      const h = new WriteHandler(mockEnqueue());
      await expect(
        h.postTweet({ text: 'x', media_paths: ['a', 'b', 'c', 'd', 'e'] }, fakeContext()),
      ).rejects.toThrow(/at most 4/);
    });

    it('enqueues with sanitized media_paths and resolved account', async () => {
      const enq = mockEnqueue();
      const ctx = fakeContext();
      const h = new WriteHandler(enq);

      const result = await h.postTweet(
        { text: 'hello', media_paths: ['/a.jpg', '', '  ', '/b.jpg'], alt_texts: ['alt1', 123] },
        ctx,
      );

      expect(ctx.resolveAccountId).toHaveBeenCalledWith(undefined);
      expect(enq.enqueuePost).toHaveBeenCalledWith(expect.objectContaining({
        accountId: 'acc-1',
        text: 'hello',
        mediaPaths: ['/a.jpg', '/b.jpg'],
        // non-string alt_texts are coerced to '' so the array stays index-aligned
        altTexts: ['alt1', ''],
      }));
      expect(result).toEqual({ id: 'a-1', idempotencyKey: 'k-1' });
    });

    it('forwards account_id to resolveAccountId', async () => {
      const enq = mockEnqueue();
      const ctx = fakeContext();
      const h = new WriteHandler(enq);

      await h.postTweet({ text: 'x', account_id: 'acc-9' }, ctx);

      expect(ctx.resolveAccountId).toHaveBeenCalledWith('acc-9');
    });
  });

  describe('replyToTweet', () => {
    it('throws when parent_tweet_url has no /status/', async () => {
      const h = new WriteHandler(mockEnqueue());
      await expect(
        h.replyToTweet({ text: 'x', parent_tweet_url: 'https://x.com/u' }, fakeContext()),
      ).rejects.toThrow(/\/status\//);
    });

    it('enqueues on valid input', async () => {
      const enq = mockEnqueue();
      const h = new WriteHandler(enq);
      await h.replyToTweet({ text: 'r', parent_tweet_url: 'https://x.com/u/status/1' }, fakeContext());
      expect(enq.enqueueReply).toHaveBeenCalled();
    });
  });

  describe('like_tweet / retweet / quote / bookmark / follow', () => {
    it.each([
      ['likeTweet', 'enqueueLike', { tweet_url: 'https://x.com/u/status/1' }],
      ['retweet', 'enqueueRetweet', { tweet_url: 'https://x.com/u/status/1' }],
      ['bookmarkTweet', 'enqueueBookmark', { tweet_url: 'https://x.com/u/status/1' }],
    ] as const)('%s validates /status/ URL', async (method, _, args) => {
      const h = new WriteHandler(mockEnqueue());
      await expect((h[method] as (a: unknown, c: unknown) => unknown)({ ...args, tweet_url: 'invalid' }, fakeContext()))
        .rejects.toThrow(/\/status\//);
    });

    it('quoteTweet requires both text and valid tweet_url', async () => {
      const h = new WriteHandler(mockEnqueue());
      await expect(h.quoteTweet({ tweet_url: 'https://x.com/u/status/1' }, fakeContext())).rejects.toThrow(/text/);
      await expect(h.quoteTweet({ text: 'x', tweet_url: 'invalid' }, fakeContext())).rejects.toThrow(/\/status\//);
    });

    it('followAccount requires target_handle', async () => {
      const h = new WriteHandler(mockEnqueue());
      await expect(h.followAccount({}, fakeContext())).rejects.toThrow(/target_handle/);
    });
  });

  describe('postThread', () => {
    it('throws on empty array', async () => {
      const h = new WriteHandler(mockEnqueue());
      await expect(h.postThread({ tweets: [] }, fakeContext())).rejects.toThrow(/non-empty/);
      await expect(h.postThread({ tweets: 'not-array' }, fakeContext())).rejects.toThrow(/non-empty/);
    });

    it('enqueues each tweet with 5s stagger between scheduledAt', async () => {
      const enq = mockEnqueue();
      const h = new WriteHandler(enq);

      const result = await h.postThread({ tweets: ['a', 'b', 'c'] }, fakeContext());

      expect(enq.enqueuePost).toHaveBeenCalledTimes(3);
      const calls = enq.enqueuePost.mock.calls;
      const t0 = (calls[0][0].scheduledAt as Date).getTime();
      const t1 = (calls[1][0].scheduledAt as Date).getTime();
      const t2 = (calls[2][0].scheduledAt as Date).getTime();
      expect(t1 - t0).toBe(5000);
      expect(t2 - t1).toBe(5000);
      expect(result).toEqual({ enqueued: 3, actions: [
        { index: 0, id: 'a-1' },
        { index: 1, id: 'a-1' },
        { index: 2, id: 'a-1' },
      ] });
    });

    it('tags each enqueued post with thread metadata', async () => {
      const enq = mockEnqueue();
      const h = new WriteHandler(enq);

      await h.postThread({ tweets: ['a', 'b'] }, fakeContext());

      expect(enq.enqueuePost).toHaveBeenNthCalledWith(1, expect.objectContaining({
        metadata: { source: 'mcp-thread', threadIndex: 0, threadLength: 2 },
      }));
      expect(enq.enqueuePost).toHaveBeenNthCalledWith(2, expect.objectContaining({
        metadata: { source: 'mcp-thread', threadIndex: 1, threadLength: 2 },
      }));
    });
  });
});
