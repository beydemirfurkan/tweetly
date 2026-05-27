import type { DataSource, Repository } from 'typeorm';
import { AccountsService } from '../accounts.service';
import { ControlStateRepository } from '@persistence/repositories/control-state.repository';
import type { AccountEntity } from '@persistence/entities/account.entity';

describe('AccountsService', () => {
  function createService(): {
    service: AccountsService;
    repo: jest.Mocked<Pick<Repository<AccountEntity>, 'findOne' | 'find' | 'save' | 'update'>>;
    query: jest.Mock;
    managerQuery: jest.Mock;
  } {
    const repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    const query = jest.fn();
    // Transactions inside recordSessionFailure: forward `manager.query` to a
    // dedicated mock so we can drive the increment's RETURNING payload.
    const managerQuery = jest.fn().mockResolvedValue([]);
    const transaction = jest.fn(async (fn: (m: { query: jest.Mock }) => Promise<unknown>) =>
      fn({ query: managerQuery }),
    );
    const dataSource = { query, transaction } as unknown as DataSource;
    const state = new ControlStateRepository(dataSource);
    return {
      service: new AccountsService(repo as unknown as Repository<AccountEntity>, dataSource, state),
      repo,
      query,
      managerQuery,
    };
  }

  it('records successful session health and resets auth failure count', async () => {
    const { service, repo, managerQuery } = createService();
    repo.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

    await service.recordSessionSuccess('test-account');

    expect(repo.update).toHaveBeenCalledWith({ id: 'test-account' }, { lastUsedAt: expect.any(Date) });
    // recordSessionSuccess still goes through ControlStateRepository.upsert,
    // which now wraps writes in a transaction → asserted via managerQuery.
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO control_state'), [
      'session.health',
      'test-account',
      'healthy',
    ]);
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO control_state'), [
      'session.auth_failure_count',
      'test-account',
      '0',
    ]);
  });

  it('pauses account after repeated auth failures', async () => {
    const { service, repo, managerQuery } = createService();
    repo.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });
    // First call inside the transaction is the atomic INSERT-RETURNING that
    // bumps session.auth_failure_count to the new total. Rest of the writes
    // (metadata + paused flip) just need to resolve.
    managerQuery.mockImplementation((sql: string) => {
      if (sql.includes('RETURNING value')) return Promise.resolve([{ value: '3' }]);
      return Promise.resolve([]);
    });

    const failures = await service.recordSessionFailure('test-account', 'logged out');

    expect(failures).toBe(3);
    // The increment ran exactly once (no read-modify-write).
    const incrementCalls = managerQuery.mock.calls.filter(([sql]) => sql.includes('RETURNING value'));
    expect(incrementCalls).toHaveLength(1);
    expect(incrementCalls[0][1]).toEqual(['test-account']);
    // Metadata writes are inside the same transaction (manager.query) — not
    // the loose dataSource.query path the old code used.
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO control_state'), [
      'session.health',
      'test-account',
      'unhealthy',
    ]);
    // Pause is applied via the transactional manager too so the status flip
    // and the counter bump are atomic together.
    expect(managerQuery).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE accounts SET status = 'paused'/),
      ['test-account'],
    );
  });

  it('returns the increment value from the atomic SQL — does NOT pre-read the prior count', async () => {
    const { service, repo, managerQuery, query } = createService();
    repo.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });
    managerQuery.mockImplementation((sql: string) => {
      if (sql.includes('RETURNING value')) return Promise.resolve([{ value: '1' }]);
      return Promise.resolve([]);
    });

    await service.recordSessionFailure('acc', 'reason');

    // No SELECT auth_failure_count round-trip is issued any more — the
    // increment happens inside the same INSERT-ON-CONFLICT statement.
    expect(query).not.toHaveBeenCalledWith(expect.stringMatching(/SELECT value.*auth_failure_count/i));
  });

  it('creates a new account with auth token stored in database', async () => {
    const { service, repo } = createService();
    const saved = {
      id: 'test-account',
      displayName: 'Test Account',
      authToken: 'auth-token',
      authMulti: null,
      ct0: 'ct0-token',
      twid: null,
      status: 'active',
      createdAt: new Date(),
      lastUsedAt: null,
    } as AccountEntity;
    repo.findOne.mockResolvedValue(null);
    repo.save.mockResolvedValue(saved);

    const account = await service.upsertAccount({
      id: 'test-account',
      userId: 'user-1',
      displayName: 'Test Account',
      authToken: 'auth-token',
      ct0: 'ct0-token',
    });

    expect(account).toBe(saved);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'test-account',
      userId: 'user-1',
      authToken: 'auth-token',
      ct0: 'ct0-token',
      status: 'active',
    }));
  });

  it('rejects upsert if account belongs to a different user', async () => {
    const { service, repo } = createService();
    repo.findOne.mockResolvedValue({
      id: 'shared',
      userId: 'user-A',
    } as AccountEntity);

    await expect(
      service.upsertAccount({ id: 'shared', userId: 'user-B', authToken: 'tok' }),
    ).rejects.toThrow('account belongs to a different user');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('listAllForUser scopes find to userId', async () => {
    const { service, repo } = createService();
    repo.find.mockResolvedValue([] as AccountEntity[]);
    await service.listAllForUser('user-X');
    expect(repo.find).toHaveBeenCalledWith({ where: { userId: 'user-X' }, order: { id: 'ASC' } });
  });

  it('findByIdForUser scopes lookup to userId', async () => {
    const { service, repo } = createService();
    repo.findOne.mockResolvedValue(null);
    await service.findByIdForUser('acc-1', 'user-X');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'acc-1', userId: 'user-X' } });
  });
});
