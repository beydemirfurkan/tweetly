import { MonitorPollerService } from './monitor-poller.service';

function createService() {
  const monitoring = {
    findEnabled: jest.fn().mockResolvedValue([]),
    updateLastSeen: jest.fn().mockResolvedValue(null),
    updateLastCheck: jest.fn().mockResolvedValue(null),
    recordDelivery: jest.fn().mockResolvedValue(null),
  };
  const webhook = {
    deliver: jest.fn().mockResolvedValue({ ok: true }),
  };
  const xDirect = {
    getUserTweets: jest.fn().mockResolvedValue([]),
  };
  // Mock DataSource for advisory-lock calls. Default: lock acquired.
  const dataSource = {
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) return Promise.resolve([{ acquired: true }]);
      if (sql.includes('pg_advisory_unlock')) return Promise.resolve([{ pg_advisory_unlock: true }]);
      return Promise.resolve([]);
    }),
  };
  const service = new MonitorPollerService(
    monitoring as any,
    webhook as any,
    xDirect as any,
    dataSource as any,
  );
  return { service, monitoring, webhook, xDirect, dataSource };
}

describe('MonitorPollerService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    delete process.env.MONITOR_POLLING_ENABLED;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('poll', () => {
    it('does nothing when no monitors enabled', async () => {
      const { service, xDirect } = createService();
      await service.poll();
      expect(xDirect.getUserTweets).not.toHaveBeenCalled();
    });

    it('calls updateLastCheck when no tweets returned', async () => {
      const { service, monitoring, xDirect } = createService();
      monitoring.findEnabled.mockResolvedValue([
        { id: 'mon-1', accountId: 'acc-1', targetHandle: 'user', webhookUrl: 'https://hook.test', lastTweetUrl: null, eventTypes: ['tweet.new'] },
      ]);
      xDirect.getUserTweets.mockResolvedValue([]);

      await service.poll();

      expect(monitoring.updateLastCheck).toHaveBeenCalledWith('mon-1');
      expect(monitoring.updateLastSeen).not.toHaveBeenCalled();
    });

    it('calls updateLastCheck when tweet url unchanged', async () => {
      const { service, monitoring, xDirect } = createService();
      const url = 'https://x.com/user/status/100';
      monitoring.findEnabled.mockResolvedValue([
        { id: 'mon-1', accountId: 'acc-1', targetHandle: 'user', webhookUrl: 'https://hook.test', lastTweetUrl: url, eventTypes: ['tweet.new'] },
      ]);
      xDirect.getUserTweets.mockResolvedValue([{ url, text: 'hi', displayName: 'User', likeCount: '0', retweetCount: '0', replyCount: '0', postedAt: '' }]);

      await service.poll();

      expect(monitoring.updateLastCheck).toHaveBeenCalledWith('mon-1');
      expect(monitoring.updateLastSeen).not.toHaveBeenCalled();
    });

    it('delivers webhook when new tweet detected', async () => {
      const { service, monitoring, webhook, xDirect } = createService();
      const newUrl = 'https://x.com/user/status/999';
      monitoring.findEnabled.mockResolvedValue([
        { id: 'mon-1', accountId: 'acc-1', targetHandle: 'user', webhookUrl: 'https://hook.test', lastTweetUrl: 'https://x.com/user/status/1', eventTypes: ['tweet.new'] },
      ]);
      xDirect.getUserTweets.mockResolvedValue([
        { url: newUrl, text: 'new tweet', displayName: 'User', likeCount: '5', retweetCount: '2', replyCount: '1', postedAt: '2025-01-01' },
      ]);
      monitoring.recordDelivery.mockResolvedValue(null);

      await service.poll();

      expect(monitoring.updateLastSeen).toHaveBeenCalledWith('mon-1', newUrl);
      expect(webhook.deliver).toHaveBeenCalledWith(
        'https://hook.test',
        expect.objectContaining({ event: 'tweet.new', target_handle: 'user' }),
        // monitor.webhookSecret defaults to undefined in this fixture; service forwards it as-is.
        undefined,
      );
    });

    it('skips webhook when event type not in eventTypes', async () => {
      const { service, monitoring, webhook, xDirect } = createService();
      monitoring.findEnabled.mockResolvedValue([
        { id: 'mon-1', accountId: 'acc-1', targetHandle: 'user', webhookUrl: 'https://hook.test', lastTweetUrl: null, eventTypes: [] },
      ]);
      xDirect.getUserTweets.mockResolvedValue([{ url: 'https://x.com/user/status/2', text: 'hi', displayName: 'U', likeCount: '0', retweetCount: '0', replyCount: '0', postedAt: '' }]);

      await service.poll();

      expect(webhook.deliver).not.toHaveBeenCalled();
    });

    it('calls updateLastCheck and does not throw when getUserTweets errors', async () => {
      const { service, monitoring, xDirect } = createService();
      monitoring.findEnabled.mockResolvedValue([
        { id: 'mon-1', accountId: 'acc-1', targetHandle: 'user', webhookUrl: 'https://hook.test', lastTweetUrl: null, eventTypes: ['tweet.new'] },
      ]);
      xDirect.getUserTweets.mockRejectedValue(new Error('Patchright timeout'));

      await expect(service.poll()).resolves.not.toThrow();
      expect(monitoring.updateLastCheck).toHaveBeenCalled();
    });

    it('prevents concurrent polls via running flag', async () => {
      const { service, monitoring } = createService();
      monitoring.findEnabled.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve([]), 500)));

      const p1 = service.poll();
      const p2 = service.poll();
      await jest.advanceTimersByTimeAsync(600);

      await p1;
      await p2;

      expect(monitoring.findEnabled).toHaveBeenCalledTimes(1);
    });

    it('skips polling when leader lock is held by another instance', async () => {
      const { service, monitoring, dataSource } = createService();
      dataSource.query.mockImplementation((sql: string) =>
        sql.includes('pg_try_advisory_lock')
          ? Promise.resolve([{ acquired: false }])
          : Promise.resolve([]),
      );

      await service.poll();

      expect(monitoring.findEnabled).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('does not start interval when MONITOR_POLLING_ENABLED=false', () => {
      process.env.MONITOR_POLLING_ENABLED = 'false';
      const { service, monitoring } = createService();
      service.onApplicationBootstrap();

      jest.advanceTimersByTime(700_000);

      expect(monitoring.findEnabled).not.toHaveBeenCalled();
    });

    it('clears interval on shutdown', () => {
      const { service } = createService();
      service.onApplicationBootstrap();
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      service.onApplicationShutdown();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });
});
