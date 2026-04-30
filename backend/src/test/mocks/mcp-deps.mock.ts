export function mockMcpDeps() {
  const settingsRepo = { upsert: jest.fn().mockResolvedValue(undefined) };

  return {
    adminApi: {
      getQueueDepth: jest.fn().mockResolvedValue([]),
      getFormatPerformanceLast7d: jest.fn().mockResolvedValue([]),
      listActions: jest.fn().mockResolvedValue([]),
      cancelAction: jest.fn().mockResolvedValue(true),
      replayAction: jest.fn().mockResolvedValue(true),
    },
    accounts: {
      listAll: jest.fn().mockResolvedValue([]),
      listActive: jest.fn().mockResolvedValue([{ id: 'acc-default' }]),
    },
    settings: {
      getDefs: jest.fn().mockReturnValue([
        { key: 'key1', type: 'string', defaultValue: 'default1' },
      ]),
      get: jest.fn().mockResolvedValue('value1'),
      invalidateCache: jest.fn(),
    },
    dispatch: {
      runForAccount: jest.fn().mockResolvedValue(null),
      runAll: jest.fn().mockResolvedValue(null),
    },
    enqueue: {
      enqueuePost: jest.fn().mockResolvedValue({ id: 'action-1', idempotencyKey: 'k1' }),
      enqueueReply: jest.fn().mockResolvedValue({ id: 'action-2', idempotencyKey: 'k2' }),
      enqueueLike: jest.fn().mockResolvedValue({ id: 'action-3', idempotencyKey: 'k3' }),
      enqueueRetweet: jest.fn().mockResolvedValue({ id: 'action-4', idempotencyKey: 'k4' }),
      enqueueBookmark: jest.fn().mockResolvedValue({ id: 'action-5', idempotencyKey: 'k5' }),
      enqueueFollow: jest.fn().mockResolvedValue({ id: 'action-6', idempotencyKey: 'k6' }),
      enqueueQuote: jest.fn().mockResolvedValue({ id: 'action-7', idempotencyKey: 'k7' }),
    },
    engagementConfig: {
      get: jest.fn().mockResolvedValue({ maxLikesPerDay: 50, maxRetweetsPerDay: 20, maxQuotesPerDay: 10, maxBookmarksPerDay: 30 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    engagementCounter: {
      getAllDailyCounts: jest.fn().mockResolvedValue({ likes: 0, retweets: 0, quotes: 0, bookmarks: 0 }),
    },
    discoveryScheduler: {
      runForAccount: jest.fn().mockResolvedValue(null),
    },
    dataSource: {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn().mockReturnValue(settingsRepo),
    },
    xDirect: {
      searchTweets: jest.fn().mockResolvedValue([]),
      getUser: jest.fn().mockResolvedValue({ handle: 'test', displayName: 'Test' }),
      getTweet: jest.fn().mockResolvedValue({ url: 'https://x.com/user/status/1', text: 'hi' }),
      getUserTweets: jest.fn().mockResolvedValue([]),
      searchUsers: jest.fn().mockResolvedValue([]),
      getUserFollowers: jest.fn().mockResolvedValue([]),
      getXTrending: jest.fn().mockResolvedValue([]),
      unlikeTweet: jest.fn().mockResolvedValue({ ok: true }),
      unretweetTweet: jest.fn().mockResolvedValue({ ok: true }),
      unfollowAccount: jest.fn().mockResolvedValue({ ok: true }),
      deleteTweet: jest.fn().mockResolvedValue({ ok: true }),
      sendDm: jest.fn().mockResolvedValue({ ok: true }),
      updateProfile: jest.fn().mockResolvedValue({ ok: true, updated: [] }),
    },
    githubTrending: {
      fetchTrending: jest.fn().mockResolvedValue([]),
    },
    externalTech: {
      fetchCandidates: jest.fn().mockResolvedValue([]),
    },
    monitoringService: {
      create: jest.fn().mockResolvedValue({ id: 'mon-1', targetHandle: 'user' }),
      listAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(true),
      disable: jest.fn().mockResolvedValue(true),
      findEnabled: jest.fn().mockResolvedValue([]),
      updateLastSeen: jest.fn().mockResolvedValue(null),
      updateLastCheck: jest.fn().mockResolvedValue(null),
      listDeliveries: jest.fn().mockResolvedValue([]),
      recordDelivery: jest.fn().mockResolvedValue(null),
    },
  };
}
