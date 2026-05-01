import { AdminApiService } from './admin-api.service';

jest.mock('../action-engine/repositories/action-repository', () => ({
  ACTION_TABLE_CONFIG: {
    post: { table: 'post_actions' },
    reply: { table: 'reply_actions' },
    like: { table: 'like_actions' },
    bookmark: { table: 'bookmark_actions' },
    retweet: { table: 'retweet_actions' },
    follow: { table: 'follow_actions' },
    quote: { table: 'quote_actions' },
  },
}));

function createService() {
  const ds = { query: jest.fn() };
  const service = new AdminApiService(ds as any);
  return { service, ds };
}

describe('AdminApiService', () => {
  describe('getQueueDepth()', () => {
    it('returns queue depth for all action types', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([
        { status: 'pending', cnt: '5' },
        { status: 'dead', cnt: '2' },
      ]);
      const result = await service.getQueueDepth();
      expect(result.length).toBe(7);
      const post = result.find((r) => r.type === 'post');
      expect(post?.pending).toBe(5);
      expect(post?.dead).toBe(2);
      expect(post?.claimed).toBe(0);
    });

    it('uses 0 for missing statuses', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      const result = await service.getQueueDepth();
      for (const row of result) {
        expect(row.pending).toBe(0);
        expect(row.failed).toBe(0);
        expect(row.dead).toBe(0);
      }
    });

    it('queries each action table', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      await service.getQueueDepth();
      expect(ds.query).toHaveBeenCalledTimes(7);
      const calls = ds.query.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls.some((sql: string) => sql.includes('post_actions'))).toBe(true);
      expect(calls.some((sql: string) => sql.includes('like_actions'))).toBe(true);
    });
  });

  describe('listActions()', () => {
    it('queries correct table for given action type', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      await service.listActions('post');
      const sql = ds.query.mock.calls[0][0] as string;
      expect(sql).toContain('post_actions');
    });

    it('adds status filter when provided', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      await service.listActions('like', 'pending');
      const [sql, params] = ds.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('status = $1');
      expect(params).toContain('pending');
    });

    it('adds accountId filter when provided', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      await service.listActions('post', undefined, 'acc-1');
      const [sql, params] = ds.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('account_id = $');
      expect(params).toContain('acc-1');
    });

    it('respects custom limit', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      await service.listActions('post', undefined, undefined, 10);
      const params = ds.query.mock.calls[0][1] as unknown[];
      expect(params).toContain(10);
    });

    it('can filter by both status and accountId', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      await service.listActions('reply', 'failed', 'acc-2', 25);
      const [sql, params] = ds.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('WHERE');
      expect(sql).toContain('AND');
      expect(params).toContain('failed');
      expect(params).toContain('acc-2');
    });
  });

  describe('replayAction()', () => {
    it('returns true when row updated', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([{ id: 'action-1' }]);
      const result = await service.replayAction('post', 'action-1');
      expect(result).toBe(true);
    });

    it('returns false when no rows match', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      const result = await service.replayAction('post', 'nonexistent');
      expect(result).toBe(false);
    });

    it('resets status to pending and clears error fields', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([{ id: 'action-1' }]);
      await service.replayAction('like', 'action-1');
      const sql = ds.query.mock.calls[0][0] as string;
      expect(sql).toContain("status='pending'");
      expect(sql).toContain('attempts=0');
      expect(sql).toContain('last_error=NULL');
    });
  });

  describe('cancelAction()', () => {
    it('returns true when row updated', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([{ id: 'action-1' }]);
      const result = await service.cancelAction('post', 'action-1');
      expect(result).toBe(true);
    });

    it('returns false when action not in cancellable status', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      const result = await service.cancelAction('post', 'succeeded-action');
      expect(result).toBe(false);
    });

    it('sets status to cancelled', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([{ id: 'action-1' }]);
      await service.cancelAction('retweet', 'action-1');
      const sql = ds.query.mock.calls[0][0] as string;
      expect(sql).toContain("status='cancelled'");
    });
  });

  describe('archiveDeadActions()', () => {
    it('archives dead rows across all action tables', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValueOnce([{ id: 'post-1' }]);
      ds.query.mockResolvedValue([]);

      const result = await service.archiveDeadActions();

      expect(result).toHaveLength(7);
      expect(result.find((row) => row.type === 'post')?.archived).toBe(1);
      expect(ds.query).toHaveBeenCalledTimes(7);
    });

    it('keeps audit rows by changing status to cancelled', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);

      await service.archiveDeadActions();

      const sql = ds.query.mock.calls[0][0] as string;
      expect(sql).toContain("status='cancelled'");
      expect(sql).toContain("WHERE status='dead'");
      expect(sql).toContain('RETURNING id');
    });
  });

  describe('findActionAccountId()', () => {
    it('returns account_id when found', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([{ account_id: 'acc-7' }]);
      const result = await service.findActionAccountId('post', 'action-1');
      expect(result).toBe('acc-7');
    });

    it('returns null when missing', async () => {
      const { service, ds } = createService();
      ds.query.mockResolvedValue([]);
      const result = await service.findActionAccountId('reply', 'missing');
      expect(result).toBeNull();
    });
  });
});
