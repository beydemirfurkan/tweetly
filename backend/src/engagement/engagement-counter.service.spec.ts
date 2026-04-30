import { EngagementCounterService } from './engagement-counter.service';

function createService() {
  const ds = { query: jest.fn() };
  const service = new EngagementCounterService(ds as any);
  return { service, ds };
}

describe('EngagementCounterService', () => {
  describe('getDailyCount()', () => {
    it('returns count for like action', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([{ cnt: 7 }]);
      const count = await service.getDailyCount('acc-1', 'like');
      expect(count).toBe(7);
      expect(ds.query.mock.calls[0][0]).toContain('like_actions');
    });

    it('returns count for retweet action', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([{ cnt: 3 }]);
      const count = await service.getDailyCount('acc-1', 'retweet');
      expect(count).toBe(3);
      expect(ds.query.mock.calls[0][0]).toContain('retweet_actions');
    });

    it('returns count for quote action', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([{ cnt: 1 }]);
      const count = await service.getDailyCount('acc-1', 'quote');
      expect(count).toBe(1);
      expect(ds.query.mock.calls[0][0]).toContain('quote_actions');
    });

    it('returns count for bookmark action', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([{ cnt: 5 }]);
      const count = await service.getDailyCount('acc-1', 'bookmark');
      expect(count).toBe(5);
      expect(ds.query.mock.calls[0][0]).toContain('bookmark_actions');
    });

    it('returns 0 when query returns empty rows', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      const count = await service.getDailyCount('acc-1', 'like');
      expect(count).toBe(0);
    });

    it('passes accountId as query parameter', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([{ cnt: 2 }]);
      await service.getDailyCount('acc-42', 'like');
      expect(ds.query).toHaveBeenCalledWith(expect.any(String), ['acc-42']);
    });
  });

  describe('getAllDailyCounts()', () => {
    it('returns counts for all 4 action types', async () => {
      const { service, ds } = createService();
      ds.query
        .mockResolvedValueOnce([{ cnt: 10 }])
        .mockResolvedValueOnce([{ cnt: 3 }])
        .mockResolvedValueOnce([{ cnt: 1 }])
        .mockResolvedValueOnce([{ cnt: 6 }]);
      const counts = await service.getAllDailyCounts('acc-1');
      expect(counts).toEqual({ like: 10, retweet: 3, quote: 1, bookmark: 6 });
    });

    it('runs all 4 queries in parallel', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([{ cnt: 0 }]);
      await service.getAllDailyCounts('acc-1');
      expect(ds.query).toHaveBeenCalledTimes(4);
    });
  });

  describe('withinDailyLimit()', () => {
    it('returns true when count is below limit', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([{ cnt: 5 }]);
      const result = await service.withinDailyLimit('acc-1', 'like', 15);
      expect(result).toBe(true);
    });

    it('returns false when count equals limit', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([{ cnt: 15 }]);
      const result = await service.withinDailyLimit('acc-1', 'like', 15);
      expect(result).toBe(false);
    });

    it('returns false when maxPerDay is 0', async () => {
      const { service, ds } = createService();
      const result = await service.withinDailyLimit('acc-1', 'like', 0);
      expect(result).toBe(false);
      expect(ds.query).not.toHaveBeenCalled();
    });

    it('returns false when maxPerDay is negative', async () => {
      const { service } = createService();
      const result = await service.withinDailyLimit('acc-1', 'like', -5);
      expect(result).toBe(false);
    });
  });
});
