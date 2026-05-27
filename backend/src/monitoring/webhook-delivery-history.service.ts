import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookDeliveryEntity } from '@persistence/entities/webhook-delivery.entity';

/**
 * Persists and queries the webhook delivery audit trail. Kept separate
 * from MonitoringService (monitor CRUD) and WebhookDeliveryService (HTTP
 * delivery) so each layer has a single concern: lifecycle vs network vs
 * audit.
 */
@Injectable()
export class WebhookDeliveryHistoryService {
  constructor(
    @InjectRepository(WebhookDeliveryEntity)
    private readonly deliveries: Repository<WebhookDeliveryEntity>,
  ) {}

  list(monitorId: string, limit = 20): Promise<WebhookDeliveryEntity[]> {
    return this.deliveries.find({
      where: { monitorId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async record(
    monitorId: string,
    eventType: string,
    payload: Record<string, unknown>,
    status: 'delivered' | 'failed',
    error?: string,
  ): Promise<void> {
    await this.deliveries.save(
      this.deliveries.create({
        monitorId,
        eventType,
        payload,
        status,
        attempts: 1,
        lastError: error ?? null,
        deliveredAt: status === 'delivered' ? new Date() : null,
      }),
    );
  }
}
