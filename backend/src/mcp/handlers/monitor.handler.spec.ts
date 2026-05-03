import { MonitorHandler } from './monitor.handler';
import { fakeContext } from './__tests__/test-helpers';
import type { MonitoringService } from '@/monitoring/monitoring.service';

function mockMonitoring(): jest.Mocked<MonitoringService> {
  return {
    create: jest.fn().mockResolvedValue({ id: 'm-1' }),
    listAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(true),
    disable: jest.fn().mockResolvedValue(true),
    listDeliveries: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<MonitoringService>;
}

describe('MonitorHandler', () => {
  describe('createMonitor', () => {
    it('throws on missing target_handle', async () => {
      const h = new MonitorHandler(mockMonitoring());
      await expect(h.createMonitor({ webhook_url: 'https://hook' }, fakeContext())).rejects.toThrow(/target_handle/);
    });

    it('throws when webhook_url is not http(s)', async () => {
      const h = new MonitorHandler(mockMonitoring());
      await expect(
        h.createMonitor({ target_handle: 'u', webhook_url: 'ftp://x' }, fakeContext()),
      ).rejects.toThrow(/HTTP\/HTTPS/);
    });

    it('defaults event_types to [tweet.new] when omitted', async () => {
      const m = mockMonitoring();
      const h = new MonitorHandler(m);
      await h.createMonitor({ target_handle: 'u', webhook_url: 'https://hook' }, fakeContext());
      expect(m.create).toHaveBeenCalledWith(expect.objectContaining({
        targetHandle: 'u',
        webhookUrl: 'https://hook',
        eventTypes: ['tweet.new'],
      }));
    });
  });

  describe('listMonitors', () => {
    it('filters monitors by the userAccountIdSet', async () => {
      const m = mockMonitoring();
      m.listAll.mockResolvedValue([
        { id: 'm-1', accountId: 'acc-1' },
        { id: 'm-2', accountId: 'other-user-acc' },
      ] as never);
      const ctx = fakeContext({ userAccountIdSet: jest.fn().mockResolvedValue(new Set(['acc-1'])) });
      const h = new MonitorHandler(m);

      const result = await h.listMonitors({}, ctx);

      expect(result).toEqual({ count: 1, monitors: [{ id: 'm-1', accountId: 'acc-1' }] });
    });
  });

  describe('getMonitor / deleteMonitor / pauseMonitor', () => {
    it('throws 404 when monitor not found', async () => {
      const h = new MonitorHandler(mockMonitoring());
      await expect(h.getMonitor({ monitor_id: 'missing' }, fakeContext())).rejects.toThrow(/not found/);
    });

    it('asserts ownership before exposing the monitor', async () => {
      const m = mockMonitoring();
      m.findById.mockResolvedValue({ id: 'm-1', accountId: 'foreign-acc' } as never);
      const ctx = fakeContext({
        assertAccountOwnership: jest.fn().mockRejectedValue(new Error('Account foreign-acc not found')),
      });
      const h = new MonitorHandler(m);

      await expect(h.getMonitor({ monitor_id: 'm-1' }, ctx)).rejects.toThrow(/foreign-acc/);
      expect(ctx.assertAccountOwnership).toHaveBeenCalledWith('foreign-acc');
    });

    it('deleteMonitor returns ok and pauseMonitor returns paused on success', async () => {
      const m = mockMonitoring();
      m.findById.mockResolvedValue({ id: 'm-1', accountId: 'acc-1' } as never);
      const h = new MonitorHandler(m);

      await expect(h.deleteMonitor({ monitor_id: 'm-1' }, fakeContext())).resolves.toEqual({ ok: true });
      await expect(h.pauseMonitor({ monitor_id: 'm-1' }, fakeContext())).resolves.toEqual({ ok: true, status: 'paused' });
    });
  });
});
