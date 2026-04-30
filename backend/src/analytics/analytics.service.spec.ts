import { AnalyticsService } from './analytics.service';

function createService() {
  const ds = { query: jest.fn() };
  const service = new AnalyticsService(ds as any);
  return { service, ds };
}

const SINCE = new Date('2024-01-01T00:00:00Z');

describe('AnalyticsService', () => {
  describe('getFormatPerformance()', () => {
    it('returns empty array when no rows', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      const result = await service.getFormatPerformance(SINCE);
      expect(result).toHaveLength(0);
    });

    it('queries without account filter when no accountId', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      await service.getFormatPerformance(SINCE);
      const [sql, params] = ds.query.mock.calls[0] as [string, unknown[]];
      expect(sql).not.toContain('account_id');
      expect(params).toHaveLength(1);
      expect(params[0]).toBe(SINCE.toISOString());
    });

    it('queries with account filter when accountId provided', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      await service.getFormatPerformance(SINCE, 'acc-1');
      const [sql, params] = ds.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('account_id');
      expect(params).toContain('acc-1');
    });

    it('aggregates success and failure counts per format', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([
        { format: 'question', type: 'post_success', cnt: '8', avg_dur: '500' },
        { format: 'question', type: 'post_failure', cnt: '2', avg_dur: null },
      ]);
      const result = await service.getFormatPerformance(SINCE);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        format: 'question',
        total: 10,
        success: 8,
        failure: 2,
        successRate: 0.8,
      });
    });

    it('groups multiple rows for same format together', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([
        { format: 'repo_drop', type: 'post_success', cnt: '5', avg_dur: '400' },
        { format: 'repo_drop', type: 'post_failure', cnt: '1', avg_dur: null },
        { format: 'repo_drop', type: 'reply_success', cnt: '3', avg_dur: '200' },
      ]);
      const result = await service.getFormatPerformance(SINCE);
      expect(result).toHaveLength(1);
      const rd = result[0];
      expect(rd.total).toBe(9);
      expect(rd.success).toBe(8);
      expect(rd.failure).toBe(1);
    });

    it('returns separate entries for different formats', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([
        { format: 'question', type: 'post_success', cnt: '3', avg_dur: '300' },
        { format: 'comparison', type: 'post_success', cnt: '7', avg_dur: '600' },
      ]);
      const result = await service.getFormatPerformance(SINCE);
      expect(result).toHaveLength(2);
      const formats = result.map((r) => r.format);
      expect(formats).toContain('question');
      expect(formats).toContain('comparison');
    });

    it('computes successRate as 0 when total is 0', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([
        { format: 'hot_take', type: 'unknown_event', cnt: '0', avg_dur: null },
      ]);
      const result = await service.getFormatPerformance(SINCE);
      expect(result[0].successRate).toBe(0);
    });

    it('computes avgDurationMs weighted by count', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([
        { format: 'question', type: 'post_success', cnt: '2', avg_dur: '100' },
        { format: 'question', type: 'reply_success', cnt: '2', avg_dur: '300' },
      ]);
      const result = await service.getFormatPerformance(SINCE);
      // weighted avg: (2*100 + 2*300) / 4 = 200
      expect(result[0].avgDurationMs).toBe(200);
    });

    it('sets avgDurationMs to 0 when no duration data', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([
        { format: 'question', type: 'post_success', cnt: '5', avg_dur: null },
      ]);
      const result = await service.getFormatPerformance(SINCE);
      expect(result[0].avgDurationMs).toBe(0);
    });

    it('recognizes _success suffix event types', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([
        { format: 'comparison', type: 'generate_success', cnt: '4', avg_dur: null },
      ]);
      const result = await service.getFormatPerformance(SINCE);
      expect(result[0].success).toBe(4);
    });

    it('recognizes _failure suffix event types', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([
        { format: 'question', type: 'generate_failure', cnt: '3', avg_dur: null },
      ]);
      const result = await service.getFormatPerformance(SINCE);
      expect(result[0].failure).toBe(3);
    });
  });
});
