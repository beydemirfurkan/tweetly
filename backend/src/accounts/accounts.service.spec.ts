import type { DataSource, Repository } from 'typeorm';
import { AccountsService } from './accounts.service';
import type { AccountEntity } from '../persistence/entities/account.entity';

describe('AccountsService', () => {
  function createService(): {
    service: AccountsService;
    repo: jest.Mocked<Pick<Repository<AccountEntity>, 'findOne' | 'find' | 'save' | 'update'>>;
    query: jest.Mock;
  } {
    const repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    const query = jest.fn();
    const dataSource = { query } as unknown as DataSource;
    return {
      service: new AccountsService(repo as unknown as Repository<AccountEntity>, dataSource),
      repo,
      query,
    };
  }

  it('records successful session health and resets auth failure count', async () => {
    const { service, repo, query } = createService();
    repo.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });
    query.mockResolvedValue([]);

    await service.recordSessionSuccess('test-account');

    expect(repo.update).toHaveBeenCalledWith({ id: 'test-account' }, { lastUsedAt: expect.any(Date) });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO control_state'), [
      'session.health',
      'test-account',
      'healthy',
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO control_state'), [
      'session.auth_failure_count',
      'test-account',
      '0',
    ]);
  });

  it('pauses account after repeated auth failures', async () => {
    const { service, repo, query } = createService();
    repo.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });
    query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT value')) return Promise.resolve([{ value: '2' }]);
      return Promise.resolve([]);
    });

    const failures = await service.recordSessionFailure('test-account', 'logged out');

    expect(failures).toBe(3);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO control_state'), [
      'session.health',
      'test-account',
      'unhealthy',
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO control_state'), [
      'session.auth_failure_count',
      'test-account',
      '3',
    ]);
    expect(repo.update).toHaveBeenCalledWith({ id: 'test-account' }, { status: 'paused' });
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
      displayName: 'Test Account',
      authToken: 'auth-token',
      ct0: 'ct0-token',
    });

    expect(account).toBe(saved);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'test-account',
      authToken: 'auth-token',
      ct0: 'ct0-token',
      status: 'active',
    }));
  });
});
