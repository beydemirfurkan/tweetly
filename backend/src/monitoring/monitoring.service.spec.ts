import { MonitoringService } from './monitoring.service';
import { mockRepository } from '@/test/mocks/repository.mock';
import type { MonitorEntity } from '@persistence/entities/monitor.entity';
import type { WebhookDeliveryEntity } from '@persistence/entities/webhook-delivery.entity';

function createService() {
  const monitors = mockRepository<MonitorEntity>();
  const deliveries = mockRepository<WebhookDeliveryEntity>();
  const service = new MonitoringService(monitors as any, deliveries as any);
  return { service, monitors, deliveries };
}

describe('MonitoringService', () => {
  describe('create', () => {
    it('creates new monitor when no existing one found', async () => {
      const { service, monitors } = createService();
      monitors.findOne.mockResolvedValue(null);
      const saved = { id: 'mon-1', targetHandle: 'user', webhookUrl: 'https://hook.test/cb' };
      monitors.save.mockResolvedValue(saved as any);
      monitors.create.mockReturnValue(saved as any);

      const result = await service.create({
        accountId: 'acc-1',
        targetHandle: 'user',
        webhookUrl: 'https://hook.test/cb',
      });

      expect(monitors.save).toHaveBeenCalled();
      expect(result).toBe(saved);
    });

    it('updates existing monitor when one already exists', async () => {
      const { service, monitors } = createService();
      const existing = {
        id: 'mon-1',
        webhookUrl: 'old',
        eventTypes: ['tweet.new'],
        enabled: false,
      };
      monitors.findOne.mockResolvedValue(existing as any);
      monitors.save.mockResolvedValue({ ...existing, webhookUrl: 'https://new.url', enabled: true } as any);

      const result = await service.create({
        accountId: 'acc-1',
        targetHandle: 'user',
        webhookUrl: 'https://new.url',
      });

      expect(monitors.save).toHaveBeenCalledWith(expect.objectContaining({ webhookUrl: 'https://new.url', enabled: true }));
      expect(result).toBeDefined();
    });
  });

  describe('listAll', () => {
    it('returns monitors ordered by createdAt DESC', async () => {
      const { service, monitors } = createService();
      const list = [{ id: 'mon-1' }, { id: 'mon-2' }];
      monitors.find.mockResolvedValue(list as any);

      const result = await service.listAll();

      expect(monitors.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
      expect(result).toBe(list);
    });
  });

  describe('findById', () => {
    it('returns monitor by id', async () => {
      const { service, monitors } = createService();
      monitors.findOne.mockResolvedValue({ id: 'mon-1' } as any);

      const result = await service.findById('mon-1');

      expect(monitors.findOne).toHaveBeenCalledWith({ where: { id: 'mon-1' } });
      expect(result).toEqual({ id: 'mon-1' });
    });

    it('returns null when monitor not found', async () => {
      const { service, monitors } = createService();
      monitors.findOne.mockResolvedValue(null);

      expect(await service.findById('nonexistent')).toBeNull();
    });
  });

  describe('delete', () => {
    it('returns true when deletion affects rows', async () => {
      const { service, monitors } = createService();
      monitors.delete.mockResolvedValue({ affected: 1 } as any);

      expect(await service.delete('mon-1')).toBe(true);
    });

    it('returns false when no rows affected', async () => {
      const { service, monitors } = createService();
      monitors.delete.mockResolvedValue({ affected: 0 } as any);

      expect(await service.delete('nonexistent')).toBe(false);
    });
  });

  describe('disable', () => {
    it('sets enabled=false and returns true', async () => {
      const { service, monitors } = createService();
      monitors.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.disable('mon-1');

      expect(monitors.update).toHaveBeenCalledWith({ id: 'mon-1' }, { enabled: false });
      expect(result).toBe(true);
    });
  });

  describe('findEnabled', () => {
    it('queries only enabled monitors', async () => {
      const { service, monitors } = createService();
      monitors.find.mockResolvedValue([]);

      await service.findEnabled();

      expect(monitors.find).toHaveBeenCalledWith({ where: { enabled: true } });
    });
  });

  describe('updateLastSeen', () => {
    it('updates lastCheckAt and lastTweetUrl', async () => {
      const { service, monitors } = createService();
      monitors.update.mockResolvedValue({ affected: 1 } as any);

      await service.updateLastSeen('mon-1', 'https://x.com/user/status/123');

      expect(monitors.update).toHaveBeenCalledWith(
        { id: 'mon-1' },
        expect.objectContaining({ lastTweetUrl: 'https://x.com/user/status/123' }),
      );
    });
  });

  describe('recordDelivery', () => {
    it('saves delivery record with delivered status', async () => {
      const { service, deliveries } = createService();
      const delivery = { id: 'del-1' };
      deliveries.create.mockReturnValue(delivery as any);
      deliveries.save.mockResolvedValue(delivery as any);

      await service.recordDelivery('mon-1', 'tweet.new', { event: 'tweet.new' }, 'delivered');

      expect(deliveries.save).toHaveBeenCalled();
    });
  });
});
