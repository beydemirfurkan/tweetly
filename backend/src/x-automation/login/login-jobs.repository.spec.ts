import { LoginJobsRepository } from './login-jobs.repository';
import type { DataSource } from 'typeorm';

function makeRepoWithMockedQuery(): { repo: LoginJobsRepository; query: jest.Mock } {
  const query = jest.fn().mockResolvedValue([]);
  const ds = { query } as unknown as DataSource;
  return { repo: new LoginJobsRepository(ds), query };
}

describe('LoginJobsRepository', () => {
  describe('claimNext', () => {
    it("SQL reclaims both 'queued' AND orphaned 'running' rows", async () => {
      const { repo, query } = makeRepoWithMockedQuery();
      await repo.claimNext(300);

      expect(query).toHaveBeenCalledTimes(1);
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toContain("status = 'queued'");
      expect(sql).toContain("status = 'running'");
      // The orphan-reclaim clause requires locked_until to be in the past so
      // a healthy in-flight job is not stolen mid-login.
      expect(sql).toMatch(/locked_until\s+<\s+now\(\)/);
      // Single-row claim with row-level lock + SKIP LOCKED so multiple
      // instances do not collide.
      expect(sql).toContain('LIMIT 1');
      expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    });

    it('passes the lockTtlSec value as the first parameter', async () => {
      const { repo, query } = makeRepoWithMockedQuery();
      await repo.claimNext(123);
      expect(query.mock.calls[0][1]).toEqual([123]);
    });
  });

  describe('extendLock', () => {
    it("only extends rows still in 'running' state under our id", async () => {
      const { repo, query } = makeRepoWithMockedQuery();
      await repo.extendLock('job-x', 300);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/UPDATE account_login_jobs/);
      expect(sql).toMatch(/locked_until\s*=\s*now\(\)\s*\+\s*\(\$2/);
      expect(sql).toMatch(/WHERE id = \$1 AND status = 'running'/);
      expect(params).toEqual(['job-x', 300]);
    });
  });

  describe('resetStaleRunningJobs', () => {
    it("demotes expired 'running' rows back to 'queued' and reports the count", async () => {
      const { repo, query } = makeRepoWithMockedQuery();
      query.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);

      const recovered = await repo.resetStaleRunningJobs();

      const sql = query.mock.calls[0][0] as string;
      expect(sql).toMatch(/UPDATE account_login_jobs/);
      expect(sql).toMatch(/SET status = 'queued'/);
      expect(sql).toMatch(/locked_until = NULL/);
      expect(sql).toMatch(/WHERE status = 'running'/);
      expect(sql).toMatch(/locked_until\s+<\s+now\(\)/);
      expect(recovered).toBe(2);
    });

    it('returns 0 when nothing was recovered', async () => {
      const { repo, query } = makeRepoWithMockedQuery();
      query.mockResolvedValueOnce([]);
      await expect(repo.resetStaleRunningJobs()).resolves.toBe(0);
    });
  });
});
