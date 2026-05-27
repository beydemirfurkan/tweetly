import { MonitorFacade } from '../monitor.facade';
import type { MonitoringService } from '@/monitoring/monitoring.service';
import type { AccountFacade } from '../account.facade';

function mockMonitoring(): jest.Mocked<MonitoringService> {
  return {
    create: jest.fn().mockResolvedValue({ id: 'm-1', accountId: 'acc-1', webhookSecret: 'secret-1' }),
    listAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    rotateSecret: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(true),
    disable: jest.fn().mockResolvedValue(true),
    findEnabled: jest.fn().mockResolvedValue([]),
    updateLastSeen: jest.fn().mockResolvedValue(undefined),
    updateLastCheck: jest.fn().mockResolvedValue(undefined),
    listDeliveries: jest.fn().mockResolvedValue([]),
    recordDelivery: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<MonitoringService>;
}

function mockAccounts(): jest.Mocked<AccountFacade> {
  return {
    userAccountIds: jest.fn().mockResolvedValue(['acc-1']),
    resolveAccountId: jest.fn().mockResolvedValue('acc-1'),
    assertAccountOwnership: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AccountFacade>;
}

describe('MonitorFacade', () => {
  it('redacts webhookSecret from listForUser responses', async () => {
    const monitoring = mockMonitoring();
    monitoring.listAll.mockResolvedValue([
      { id: 'm-1', accountId: 'acc-1', webhookSecret: 'secret-1' },
      { id: 'm-2', accountId: 'other-user-acc', webhookSecret: 'secret-2' },
    ] as never);
    const facade = new MonitorFacade(monitoring, mockAccounts(), { list: jest.fn().mockResolvedValue([]), record: jest.fn() } as any);

    const result = await facade.listForUser('user-1');

    expect(result).toEqual({
      count: 1,
      monitors: [{ id: 'm-1', accountId: 'acc-1', hasWebhookSecret: true }],
    });
    expect(result.monitors[0]).not.toHaveProperty('webhookSecret');
  });

  it('returns webhookSecret once on create while redacting the monitor body', async () => {
    const facade = new MonitorFacade(mockMonitoring(), mockAccounts(), { list: jest.fn().mockResolvedValue([]), record: jest.fn() } as any);

    const result = await facade.create('user-1', { targetHandle: 'u', webhookUrl: 'https://hook' });

    expect(result).toEqual({
      ok: true,
      webhookSecret: 'secret-1',
      monitor: { id: 'm-1', accountId: 'acc-1', hasWebhookSecret: true },
    });
    expect(result.monitor).not.toHaveProperty('webhookSecret');
  });

  it('redacts webhookSecret from getOwnedMonitor responses', async () => {
    const monitoring = mockMonitoring();
    monitoring.findById.mockResolvedValue({ id: 'm-1', accountId: 'acc-1', webhookSecret: 'secret-1' } as never);
    const facade = new MonitorFacade(monitoring, mockAccounts(), { list: jest.fn().mockResolvedValue([]), record: jest.fn() } as any);

    const result = await facade.getOwnedMonitor('user-1', 'm-1');

    expect(result.monitor).toEqual({ id: 'm-1', accountId: 'acc-1', hasWebhookSecret: true });
    expect(result.monitor).not.toHaveProperty('webhookSecret');
  });

  it('returns the rotated webhookSecret once', async () => {
    const monitoring = mockMonitoring();
    monitoring.findById.mockResolvedValue({ id: 'm-1', accountId: 'acc-1', webhookSecret: 'old-secret' } as never);
    monitoring.rotateSecret.mockResolvedValue({ id: 'm-1', accountId: 'acc-1', webhookSecret: 'new-secret' } as never);
    const facade = new MonitorFacade(monitoring, mockAccounts(), { list: jest.fn().mockResolvedValue([]), record: jest.fn() } as any);

    await expect(facade.rotateSecret('user-1', 'm-1')).resolves.toEqual({
      ok: true,
      webhookSecret: 'new-secret',
    });
  });
});
