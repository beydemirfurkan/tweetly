import { EngagementConfigService } from './engagement-config.service';

function mockDataSource() {
  return { query: jest.fn() };
}

function createService() {
  const ds = mockDataSource();
  const service = new EngagementConfigService(ds as any);
  return { service, ds };
}

const ACCOUNT_ROW = {
  account_id: 'acc-1',
  enabled: true,
  max_likes_per_day: 15,
  max_retweets_per_day: 5,
  max_quotes_per_day: 2,
  max_bookmarks_per_day: 8,
  active_hour_start: 9,
  active_hour_end: 23,
  bookmark_own_tweet: true,
  like_source_tweet: false,
  retweet_source_tweet: false,
  timeline_scrape_enabled: false,
  timeline_scrape_interval_hours: 4,
  min_delay_sec: 180,
  max_delay_sec: 1800,
};

describe('EngagementConfigService', () => {
  describe('get()', () => {
    it('returns default config when no db row exists', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      const cfg = await service.get('acc-1');
      expect(cfg.accountId).toBe('acc-1');
      expect(cfg.maxLikesPerDay).toBe(15);
      expect(cfg.enabled).toBe(true);
    });

    it('maps db row to config correctly', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([ACCOUNT_ROW]);
      const cfg = await service.get('acc-1');
      expect(cfg.accountId).toBe('acc-1');
      expect(cfg.maxLikesPerDay).toBe(15);
      expect(cfg.minDelaySec).toBe(180);
    });

    it('returns cached config on second call', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([ACCOUNT_ROW]);
      await service.get('acc-1');
      await service.get('acc-1');
      expect(ds.query).toHaveBeenCalledTimes(1);
    });

    it('bypasses cache after invalidation', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([ACCOUNT_ROW]);
      await service.get('acc-1');
      service.invalidateCache('acc-1');
      await service.get('acc-1');
      expect(ds.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('upsert()', () => {
    it('merges patch with existing config and calls upsert SQL', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValueOnce([ACCOUNT_ROW]).mockResolvedValue([]);
      const result = await service.upsert('acc-1', { maxLikesPerDay: 25 });
      expect(result.maxLikesPerDay).toBe(25);
      expect(result.maxRetweetsPerDay).toBe(5);
      expect(ds.query).toHaveBeenCalledTimes(2);
      const [sql] = ds.query.mock.calls[1] as [string, unknown[]];
      expect(sql).toContain('INSERT INTO engagement_config');
      expect(sql).toContain('ON CONFLICT');
    });

    it('invalidates cache after upsert', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([ACCOUNT_ROW]);
      await service.get('acc-1');
      await service.upsert('acc-1', { enabled: false });
      await service.get('acc-1');
      expect(ds.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('isActiveHour()', () => {
    it('returns true when current hour is within active range', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([{ ...ACCOUNT_ROW, active_hour_start: 0, active_hour_end: 24 }]);
      const result = await service.isActiveHour('acc-1');
      expect(result).toBe(true);
    });

    it('returns false when current hour is outside active range', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([{ ...ACCOUNT_ROW, active_hour_start: 25, active_hour_end: 26 }]);
      const result = await service.isActiveHour('acc-1');
      expect(result).toBe(false);
    });
  });

  describe('invalidateCache()', () => {
    it('clears all cache when called without argument', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      await service.get('acc-1');
      await service.get('acc-2');
      service.invalidateCache();
      await service.get('acc-1');
      await service.get('acc-2');
      expect(ds.query).toHaveBeenCalledTimes(4);
    });
  });
});
