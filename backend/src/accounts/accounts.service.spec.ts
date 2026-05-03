import type { DataSource, Repository } from 'typeorm';
import { AccountsService } from './accounts.service';
import { ControlStateRepository } from '@persistence/repositories/control-state.repository';
import type { AccountEntity } from '@persistence/entities/account.entity';

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
    const state = new ControlStateRepository(dataSource);
    return {
      service: new AccountsService(repo as unknown as Repository<AccountEntity>, dataSource, state),
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
