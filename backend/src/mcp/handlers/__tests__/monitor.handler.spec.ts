import { MonitorHandler } from './monitor.handler';
import { fakeContext } from './__tests__/test-helpers';
import type { MonitoringService } from '@/monitoring/monitoring.service';
import type { WebhookDeliveryHistoryService } from '@/monitoring/webhook-delivery-history.service';

function mockMonitoring(): jest.Mocked<MonitoringService> {
  return {
    create: jest.fn().mockResolvedValue({ id: 'm-1' }),
    listAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    rotateSecret: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(true),
    disable: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<MonitoringService>;
}

function mockDeliveryHistory(): jest.Mocked<WebhookDeliveryHistoryService> {
  return {
    list: jest.fn().mockResolvedValue([]),
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<WebhookDeliveryHistoryService>;
}

function makeHandler(monitoring = mockMonitoring()): MonitorHandler {
  return new MonitorHandler(monitoring, mockDeliveryHistory());
}

describe('MonitorHandler', () => {
  describe('createMonitor', () => {
    it('throws on missing target_handle', async () => {
      const h = makeHandler();
      await expect(h.createMonitor({ webhook_url: 'https://hook' }, fakeContext())).rejects.toThrow(/target_handle/);
    });

    it('throws when webhook_url is not http(s)', async () => {
      const h = makeHandler();
      await expect(
        h.createMonitor({ target_handle: 'u', webhook_url: 'ftp://x' }, fakeContext()),
      ).rejects.toThrow(/unsupported_scheme/);
    });

    it('defaults event_types to [tweet.new] when omitted', async () => {
      const m = mockMonitoring();
      const h = makeHandler(m);
      await h.createMonitor({ target_handle: 'u', webhook_url: 'https://hook' }, fakeContext());
      expect(m.create).toHaveBeenCalledWith(expect.objectContaining({
        targetHandle: 'u',
        webhookUrl: 'https://hook',
        eventTypes: ['tweet.new'],
      }));
    });

    it('returns the webhook secret once while redacting it from the monitor body', async () => {
      const m = mockMonitoring();
      m.create.mockResolvedValue({ id: 'm-1', accountId: 'acc-1', webhookSecret: 'secret-1' } as never);
      const h = makeHandler(m);

      const result = await h.createMonitor({ target_handle: 'u', webhook_url: 'https://hook' }, fakeContext());

      expect(result).toEqual({
        ok: true,
        webhookSecret: 'secret-1',
        monitor: { id: 'm-1', accountId: 'acc-1', hasWebhookSecret: true },
      });
      expect(result.monitor).not.toHaveProperty('webhookSecret');
    });
  });

  describe('listMonitors', () => {
    it('filters monitors by the userAccountIdSet', async () => {
      const m = mockMonitoring();
      m.listAll.mockResolvedValue([
        { id: 'm-1', accountId: 'acc-1', webhookSecret: 'secret-1' },
        { id: 'm-2', accountId: 'other-user-acc', webhookSecret: 'secret-2' },
      ] as never);
      const ctx = fakeContext({ userAccountIdSet: jest.fn().mockResolvedValue(new Set(['acc-1'])) });
      const h = makeHandler(m);

      const result = await h.listMonitors({}, ctx);

      expect(result).toEqual({ count: 1, monitors: [{ id: 'm-1', accountId: 'acc-1', hasWebhookSecret: true }] });
      expect(result.monitors[0]).not.toHaveProperty('webhookSecret');
    });
  });

  describe('getMonitor / deleteMonitor / pauseMonitor', () => {
    it('throws 404 when monitor not found', async () => {
      const h = makeHandler();
      await expect(h.getMonitor({ monitor_id: 'missing' }, fakeContext())).rejects.toThrow(/not found/);
    });

    it('asserts ownership before exposing the monitor', async () => {
      const m = mockMonitoring();
      m.findById.mockResolvedValue({ id: 'm-1', accountId: 'foreign-acc' } as never);
      const ctx = fakeContext({
        assertAccountOwnership: jest.fn().mockRejectedValue(new Error('Account foreign-acc not found')),
      });
      const h = makeHandler(m);

      await expect(h.getMonitor({ monitor_id: 'm-1' }, ctx)).rejects.toThrow(/foreign-acc/);
      expect(ctx.assertAccountOwnership).toHaveBeenCalledWith('foreign-acc');
    });

    it('redacts webhookSecret from getMonitor read responses', async () => {
      const m = mockMonitoring();
      m.findById.mockResolvedValue({ id: 'm-1', accountId: 'acc-1', webhookSecret: 'secret-1' } as never);
      const h = makeHandler(m);

      const result = await h.getMonitor({ monitor_id: 'm-1' }, fakeContext());

      expect(result.monitor).toEqual({ id: 'm-1', accountId: 'acc-1', hasWebhookSecret: true });
      expect(result.monitor).not.toHaveProperty('webhookSecret');
    });

    it('rotates webhookSecret and returns the new secret once', async () => {
      const m = mockMonitoring();
      m.findById.mockResolvedValue({ id: 'm-1', accountId: 'acc-1', webhookSecret: 'old-secret' } as never);
      m.rotateSecret.mockResolvedValue({ id: 'm-1', accountId: 'acc-1', webhookSecret: 'new-secret' } as never);
      const h = makeHandler(m);

      await expect(h.rotateSecret({ monitor_id: 'm-1' }, fakeContext())).resolves.toEqual({
        ok: true,
        webhookSecret: 'new-secret',
      });
      expect(m.rotateSecret).toHaveBeenCalledWith('m-1');
    });

    it('deleteMonitor returns ok and pauseMonitor returns paused on success', async () => {
      const m = mockMonitoring();
      m.findById.mockResolvedValue({ id: 'm-1', accountId: 'acc-1' } as never);
      const h = makeHandler(m);

      await expect(h.deleteMonitor({ monitor_id: 'm-1' }, fakeContext())).resolves.toEqual({ ok: true });
      await expect(h.pauseMonitor({ monitor_id: 'm-1' }, fakeContext())).resolves.toEqual({ ok: true, status: 'paused' });
    });
  });
});
