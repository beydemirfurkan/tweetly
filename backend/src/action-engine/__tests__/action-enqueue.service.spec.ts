import { ActionEnqueueService } from '../action-enqueue.service';
import type { ActionStrategyRegistry } from '../strategies/action-strategy.registry';
import type { ActionRepositoryFactory } from '@persistence/repositories/action-repository.factory';
import type { IActionStrategy } from '../strategies/action-strategy.port';

function buildStrategyMock(idempotencyKey: string, type: string, columns: Record<string, unknown>): IActionStrategy {
  return {
    type: type as IActionStrategy['type'],
    tableConfig: { type: type as IActionStrategy['type'], table: `${type}_actions`, hasResultSentAt: false },
    idempotencyKey: jest.fn().mockReturnValue(idempotencyKey),
    toColumns: jest.fn().mockReturnValue(columns),
    toPayload: jest.fn().mockReturnValue({}),
  };
}

function createService(opts?: {
  insertResult?: string | null;
  strategy?: IActionStrategy;
  strategyByType?: Record<string, IActionStrategy>;
}) {
  const insertReturn = opts && 'insertResult' in opts ? opts.insertResult : 'uuid-test';
  const insertIfAbsent = jest.fn().mockResolvedValue(insertReturn);
  const repo = { insertIfAbsent };
  const repoFactory = { for: jest.fn().mockReturnValue(repo) } as unknown as ActionRepositoryFactory;
  const strategies = {
    forType: jest.fn().mockImplementation((type: string) => {
      if (opts?.strategyByType?.[type]) return opts.strategyByType[type];
      return opts?.strategy ?? buildStrategyMock('idem-default', type, { text: 'mock' });
    }),
  } as unknown as ActionStrategyRegistry;

  return {
    service: new ActionEnqueueService(strategies, repoFactory),
    insertIfAbsent,
    strategies,
    repoFactory,
  };
}

const now = new Date('2025-01-01T00:00:00Z');

describe('ActionEnqueueService', () => {
  describe('enqueuePost', () => {
    it('returns action id and idempotency key', async () => {
      const strategy = buildStrategyMock('idem-post', 'post', { text: 'Hello' });
      const { service } = createService({ strategy });
      const result = await service.enqueuePost({ accountId: 'acc-1', text: 'Hello', scheduledAt: now });
      expect(result).toEqual({ id: 'uuid-test', idempotencyKey: 'idem-post' });
    });

    it('returns null id when insertIfAbsent returns null (duplicate)', async () => {
      const strategy = buildStrategyMock('idem-post', 'post', { text: 'Hello' });
      const { service } = createService({ strategy, insertResult: null });
      const result = await service.enqueuePost({ accountId: 'acc-1', text: 'Hello', scheduledAt: now });
      expect(result.id).toBeNull();
    });

    it('passes typeSpecific columns from strategy.toColumns', async () => {
      const strategy = buildStrategyMock('idem-post', 'post', { text: 'My tweet' });
      const { service, insertIfAbsent } = createService({ strategy });
      await service.enqueuePost({ accountId: 'acc-1', text: 'My tweet', scheduledAt: now });
      expect(insertIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({ typeSpecific: expect.objectContaining({ text: 'My tweet' }) }),
      );
    });
  });

  describe('enqueueReply', () => {
    it('returns action id and idempotency key', async () => {
      const strategy = buildStrategyMock('idem-reply', 'reply', { text: 'Reply', parent_tweet_url: 'https://x.com/u/status/1' });
      const { service } = createService({ strategy });
      const result = await service.enqueueReply({
        accountId: 'acc-1',
        text: 'Reply text',
        parentTweetUrl: 'https://x.com/user/status/123456',
        scheduledAt: now,
      });
      expect(result).toEqual({ id: 'uuid-test', idempotencyKey: 'idem-reply' });
    });

    it('propagates strategy.idempotencyKey errors (e.g. invalid tweet URL)', async () => {
      const strategy = buildStrategyMock('idem', 'reply', {});
      (strategy.idempotencyKey as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid tweet URL: https://x.com/user');
      });
      const { service } = createService({ strategy });
      await expect(
        service.enqueueReply({ accountId: 'acc-1', text: 'hi', parentTweetUrl: 'https://x.com/user', scheduledAt: now }),
      ).rejects.toThrow('Invalid tweet URL');
    });
  });

  describe('enqueueLike', () => {
    it('returns id and idempotencyKey', async () => {
      const strategy = buildStrategyMock('idem-like', 'like', { target_tweet_url: 'x', target_tweet_id: '1' });
      const { service } = createService({ strategy });
      const result = await service.enqueueLike({ accountId: 'acc-1', targetTweetUrl: 'https://x.com/u/status/1', scheduledAt: now });
      expect(result.idempotencyKey).toBe('idem-like');
    });
  });

  describe('enqueueRetweet', () => {
    it('returns id and idempotencyKey', async () => {
      const strategy = buildStrategyMock('idem-retweet', 'retweet', {});
      const { service } = createService({ strategy });
      const result = await service.enqueueRetweet({ accountId: 'acc-1', targetTweetUrl: 'https://x.com/u/status/1', scheduledAt: now });
      expect(result.idempotencyKey).toBe('idem-retweet');
    });
  });

  describe('enqueueBookmark', () => {
    it('returns id and idempotencyKey', async () => {
      const strategy = buildStrategyMock('idem-bookmark', 'bookmark', {});
      const { service } = createService({ strategy });
      const result = await service.enqueueBookmark({ accountId: 'acc-1', targetTweetUrl: 'https://x.com/u/status/1', scheduledAt: now });
      expect(result.idempotencyKey).toBe('idem-bookmark');
    });
  });

  describe('enqueueFollow', () => {
    it('returns id and idempotencyKey', async () => {
      const strategy = buildStrategyMock('idem-follow', 'follow', { target_handle: 'someone' });
      const { service } = createService({ strategy });
      const result = await service.enqueueFollow({ accountId: 'acc-1', targetHandle: 'someone', scheduledAt: now });
      expect(result.idempotencyKey).toBe('idem-follow');
    });
  });

  describe('enqueueQuote', () => {
    it('returns id and idempotencyKey', async () => {
      const strategy = buildStrategyMock('idem-quote', 'quote', { text: 'My quote', target_tweet_url: 'x' });
      const { service } = createService({ strategy });
      const result = await service.enqueueQuote({
        accountId: 'acc-1',
        text: 'My quote',
        targetTweetUrl: 'https://x.com/u/status/1',
        scheduledAt: now,
      });
      expect(result.idempotencyKey).toBe('idem-quote');
    });
  });
});
