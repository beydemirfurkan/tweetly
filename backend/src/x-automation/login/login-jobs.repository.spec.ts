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

  describe('cancelForUser', () => {
    it('returns not_found when no row matches the (id,user) pair', async () => {
      const { repo, query } = makeRepoWithMockedQuery();
      query.mockResolvedValueOnce([]);
      const result = await repo.cancelForUser('job-x', 'user-1');
      expect(result).toEqual({ reason: 'not_found' });
      // No UPDATE should have fired when the SELECT came back empty.
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('returns already_terminal for success/failed/cancelled rows', async () => {
      for (const status of ['success', 'failed', 'cancelled'] as const) {
        const { repo, query } = makeRepoWithMockedQuery();
        query.mockResolvedValueOnce([{ status }]);
        const result = await repo.cancelForUser('job-x', 'user-1');
        expect(result).toEqual({ reason: 'already_terminal' });
        // No UPDATE for terminal rows.
        expect(query).toHaveBeenCalledTimes(1);
      }
    });

    it("flips a 'queued' row to 'cancelled' and reports priorStatus='queued'", async () => {
      const { repo, query } = makeRepoWithMockedQuery();
      query.mockResolvedValueOnce([{ status: 'queued' }]);
      query.mockResolvedValueOnce([{ id: 'job-x' }]);

      const result = await repo.cancelForUser('job-x', 'user-1');
      expect(result).toEqual({ priorStatus: 'queued' });

      const updateSql = query.mock.calls[1][0] as string;
      const updateParams = query.mock.calls[1][1] as unknown[];
      expect(updateSql).toMatch(/SET status = 'cancelled'/);
      // Secrets must be cleared on cancel — same hygiene as markSuccess/markFailure.
      expect(updateSql).toMatch(/encrypted_password = NULL/);
      expect(updateSql).toMatch(/encrypted_totp_secret = NULL/);
      expect(updateSql).toMatch(/AND status IN \('queued','running'\)/);
      expect(updateParams[0]).toBe('job-x');
      expect(updateParams[1]).toBe('user-1');
    });

    it("flips a 'running' row but uses the running-specific detail message", async () => {
      const { repo, query } = makeRepoWithMockedQuery();
      query.mockResolvedValueOnce([{ status: 'running' }]);
      query.mockResolvedValueOnce([{ id: 'job-x' }]);

      const result = await repo.cancelForUser('job-x', 'user-1');
      expect(result).toEqual({ priorStatus: 'running' });
      const updateParams = query.mock.calls[1][1] as string[];
      expect(updateParams[2]).toMatch(/worker will abort at next step/);
    });

    it('returns already_terminal when the UPDATE races with the worker and finds nothing', async () => {
      const { repo, query } = makeRepoWithMockedQuery();
      // Status check sees 'queued'…
      query.mockResolvedValueOnce([{ status: 'queued' }]);
      // …but by the time UPDATE runs, the worker has already promoted+failed it.
      query.mockResolvedValueOnce([]);

      const result = await repo.cancelForUser('job-x', 'user-1');
      expect(result).toEqual({ reason: 'already_terminal' });
    });
  });

  describe('isCancelled', () => {
    it("returns true only when the row exists with status='cancelled'", async () => {
      const { repo, query } = makeRepoWithMockedQuery();
      query.mockResolvedValueOnce([{}]);
      await expect(repo.isCancelled('job-x')).resolves.toBe(true);

      query.mockResolvedValueOnce([]);
      await expect(repo.isCancelled('job-x')).resolves.toBe(false);

      const sql = query.mock.calls[0][0] as string;
      expect(sql).toMatch(/status = 'cancelled'/);
    });
  });

  describe('markCancelled', () => {
    it('writes the cancelled terminal row with cleared secrets', async () => {
      const { repo, query } = makeRepoWithMockedQuery();
      await repo.markCancelled('job-x', 'cancelled by user before pickup');

      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/SET status = 'cancelled'/);
      expect(sql).toMatch(/failure_reason = NULL/);
      expect(sql).toMatch(/encrypted_password = NULL/);
      expect(sql).toMatch(/encrypted_totp_secret = NULL/);
      // finished_at must not clobber an existing value — a row that was
      // already marked finished by cancelForUser shouldn't have it bumped.
      expect(sql).toMatch(/finished_at = COALESCE\(finished_at, now\(\)\)/);
      expect(params).toEqual(['job-x', 'cancelled by user before pickup']);
    });
  });
});
