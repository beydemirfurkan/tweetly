import type { DataSource } from 'typeorm';
import { ControlStateRepository } from '../control-state.repository';

function makeRepo(): {
  repo: ControlStateRepository;
  query: jest.Mock;
  managerQuery: jest.Mock;
  transaction: jest.Mock;
} {
  const query = jest.fn();
  const managerQuery = jest.fn();
  const transaction = jest.fn(async (fn: (m: { query: jest.Mock }) => Promise<unknown>) =>
    fn({ query: managerQuery }),
  );
  const ds = { query, transaction } as unknown as DataSource;
  return { repo: new ControlStateRepository(ds), query, managerQuery, transaction };
}

describe('ControlStateRepository', () => {
  describe('upsert', () => {
    it('wraps multi-entry writes in a transaction (no partial writes on crash)', async () => {
      const { repo, transaction, managerQuery } = makeRepo();
      managerQuery.mockResolvedValue([]);

      await repo.upsert('acc-1', [
        ['session.health', 'healthy'],
        ['session.last_check_at', '2026-05-22T00:00:00Z'],
      ]);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(managerQuery).toHaveBeenCalledTimes(2);
      for (const call of managerQuery.mock.calls) {
        expect(call[0]).toMatch(/INSERT INTO control_state/);
        expect(call[0]).toMatch(/ON CONFLICT \(key, account_id\) DO UPDATE/);
      }
    });

    it('skips the transaction for an empty batch', async () => {
      const { repo, transaction, managerQuery } = makeRepo();
      await repo.upsert('acc-1', []);
      expect(transaction).not.toHaveBeenCalled();
      expect(managerQuery).not.toHaveBeenCalled();
    });
  });

  describe('incrementCounter', () => {
    it('emits a single INSERT-ON-CONFLICT RETURNING the new value', async () => {
      const { repo, query } = makeRepo();
      query.mockResolvedValueOnce([{ value: '7' }]);

      const result = await repo.incrementCounter('acc-1', 'session.auth_failure_count');

      expect(result).toBe(7);
      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO control_state/);
      expect(sql).toMatch(/ON CONFLICT \(key, account_id\) DO UPDATE/);
      expect(sql).toMatch(/RETURNING value/);
      // The CASE guard keeps a wrong-type write from poisoning the counter.
      expect(sql).toMatch(/CASE WHEN control_state\.value ~ '\^-\?\\d\+\$'/);
      expect(params).toEqual(['session.auth_failure_count', 'acc-1']);
    });

    it('parses the returned value back to an integer', async () => {
      const { repo, query } = makeRepo();
      query.mockResolvedValueOnce([{ value: '50' }]);
      await expect(repo.incrementCounter('acc-1', 'k')).resolves.toBe(50);
    });
  });
});
