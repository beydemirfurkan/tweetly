import { ActionEnqueueService } from './action-enqueue.service';

const mockInsertIfAbsent = jest.fn().mockResolvedValue('uuid-test');

jest.mock('@persistence/repositories/action-repository', () => ({
  GenericActionRepository: jest.fn().mockImplementation(() => ({
    insertIfAbsent: mockInsertIfAbsent,
  })),
  ACTION_TABLE_CONFIG: {
    post: { type: 'post', table: 'post_actions', hasResultSentAt: true },
    reply: { type: 'reply', table: 'reply_actions', hasResultSentAt: true },
    like: { type: 'like', table: 'like_actions', hasResultSentAt: false },
    bookmark: { type: 'bookmark', table: 'bookmark_actions', hasResultSentAt: false },
    retweet: { type: 'retweet', table: 'retweet_actions', hasResultSentAt: false },
    follow: { type: 'follow', table: 'follow_actions', hasResultSentAt: false },
    quote: { type: 'quote', table: 'quote_actions', hasResultSentAt: true },
  },
}));

function createService() {
  const dataSource = {} as any;
  const keys = {
    forPost: jest.fn().mockReturnValue('idem-post'),
    forReply: jest.fn().mockReturnValue('idem-reply'),
    forLike: jest.fn().mockReturnValue('idem-like'),
    forBookmark: jest.fn().mockReturnValue('idem-bookmark'),
    forRetweet: jest.fn().mockReturnValue('idem-retweet'),
    forFollow: jest.fn().mockReturnValue('idem-follow'),
    forQuote: jest.fn().mockReturnValue('idem-quote'),
  };
  return { service: new ActionEnqueueService(dataSource, keys as any), keys };
}

const now = new Date('2025-01-01T00:00:00Z');

describe('ActionEnqueueService', () => {
  beforeEach(() => {
    mockInsertIfAbsent.mockResolvedValue('uuid-test');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('enqueuePost', () => {
    it('returns action id and idempotency key', async () => {
      const { service } = createService();
      const result = await service.enqueuePost({ accountId: 'acc-1', text: 'Hello', scheduledAt: now });
      expect(result).toEqual({ id: 'uuid-test', idempotencyKey: 'idem-post' });
    });

    it('returns null id when insertIfAbsent returns null (duplicate)', async () => {
      const { service } = createService();
      mockInsertIfAbsent.mockResolvedValue(null);
      const result = await service.enqueuePost({ accountId: 'acc-1', text: 'Hello', scheduledAt: now });
      expect(result.id).toBeNull();
    });

    it('passes text to insertIfAbsent', async () => {
      const { service } = createService();
      await service.enqueuePost({ accountId: 'acc-1', text: 'My tweet', scheduledAt: now });
      expect(mockInsertIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({ typeSpecific: expect.objectContaining({ text: 'My tweet' }) }),
      );
    });
  });

  describe('enqueueReply', () => {
    it('returns action id and idempotency key', async () => {
      const { service } = createService();
      const result = await service.enqueueReply({
        accountId: 'acc-1',
        text: 'Reply text',
        parentTweetUrl: 'https://x.com/user/status/123456',
        scheduledAt: now,
      });
      expect(result).toEqual({ id: 'uuid-test', idempotencyKey: 'idem-reply' });
    });

    it('throws for invalid tweet URL', async () => {
      const { service } = createService();
      await expect(
        service.enqueueReply({ accountId: 'acc-1', text: 'hi', parentTweetUrl: 'https://x.com/user', scheduledAt: now }),
      ).rejects.toThrow('Invalid tweet URL');
    });
  });

  describe('enqueueLike', () => {
    it('returns id and idempotencyKey', async () => {
      const { service } = createService();
      const result = await service.enqueueLike({ accountId: 'acc-1', targetTweetUrl: 'https://x.com/u/status/1', scheduledAt: now });
      expect(result.idempotencyKey).toBe('idem-like');
    });
  });

  describe('enqueueRetweet', () => {
    it('returns id and idempotencyKey', async () => {
      const { service } = createService();
      const result = await service.enqueueRetweet({ accountId: 'acc-1', targetTweetUrl: 'https://x.com/u/status/1', scheduledAt: now });
      expect(result.idempotencyKey).toBe('idem-retweet');
    });
  });

  describe('enqueueBookmark', () => {
    it('returns id and idempotencyKey', async () => {
      const { service } = createService();
      const result = await service.enqueueBookmark({ accountId: 'acc-1', targetTweetUrl: 'https://x.com/u/status/1', scheduledAt: now });
      expect(result.idempotencyKey).toBe('idem-bookmark');
    });
  });

  describe('enqueueFollow', () => {
    it('returns id and idempotencyKey', async () => {
      const { service } = createService();
      const result = await service.enqueueFollow({ accountId: 'acc-1', targetHandle: 'someone', scheduledAt: now });
      expect(result.idempotencyKey).toBe('idem-follow');
    });
  });

  describe('enqueueQuote', () => {
    it('returns id and idempotencyKey', async () => {
      const { service } = createService();
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
