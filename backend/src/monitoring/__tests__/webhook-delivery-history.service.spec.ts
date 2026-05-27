import { WebhookDeliveryHistoryService } from '../webhook-delivery-history.service';
import { mockRepository } from '@/test/mocks/repository.mock';
import type { WebhookDeliveryEntity } from '@persistence/entities/webhook-delivery.entity';

function createService() {
  const deliveries = mockRepository<WebhookDeliveryEntity>();
  const service = new WebhookDeliveryHistoryService(deliveries as any);
  return { service, deliveries };
}

describe('WebhookDeliveryHistoryService', () => {
  describe('record', () => {
    it('saves delivery record with delivered status', async () => {
      const { service, deliveries } = createService();
      const delivery = { id: 'del-1' };
      deliveries.create.mockReturnValue(delivery as any);
      deliveries.save.mockResolvedValue(delivery as any);

      await service.record('mon-1', 'tweet.new', { event: 'tweet.new' }, 'delivered');

      expect(deliveries.save).toHaveBeenCalled();
    });

    it('captures error detail and leaves deliveredAt null on failure', async () => {
      const { service, deliveries } = createService();
      deliveries.create.mockImplementation((row: any) => row as any);
      deliveries.save.mockResolvedValue({} as any);

      await service.record('mon-1', 'tweet.new', { event: 'tweet.new' }, 'failed', 'HTTP 500');

      expect(deliveries.save).toHaveBeenCalledWith(
        expect.objectContaining({ lastError: 'HTTP 500', deliveredAt: null, status: 'failed' }),
      );
    });
  });

  describe('list', () => {
    it('queries deliveries scoped to monitorId ordered by createdAt DESC', async () => {
      const { service, deliveries } = createService();
      deliveries.find.mockResolvedValue([] as any);

      await service.list('mon-1', 5);

      expect(deliveries.find).toHaveBeenCalledWith({
        where: { monitorId: 'mon-1' },
        order: { createdAt: 'DESC' },
        take: 5,
      });
    });
  });
});
