import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { MonitorEntity } from '@persistence/entities/monitor.entity';
import { WebhookDeliveryEntity } from '@persistence/entities/webhook-delivery.entity';

export interface CreateMonitorInput {
  accountId: string;
  targetHandle: string;
  webhookUrl: string;
  eventTypes?: string[];
}

@Injectable()
export class MonitoringService {
  constructor(
    @InjectRepository(MonitorEntity)
    private readonly monitors: Repository<MonitorEntity>,
    @InjectRepository(WebhookDeliveryEntity)
    private readonly deliveries: Repository<WebhookDeliveryEntity>,
  ) {}

  async create(input: CreateMonitorInput): Promise<MonitorEntity> {
    const existing = await this.monitors.findOne({
      where: { accountId: input.accountId, targetHandle: input.targetHandle },
    });

    if (existing) {
      existing.webhookUrl = input.webhookUrl;
      existing.eventTypes = input.eventTypes ?? existing.eventTypes;
      existing.enabled = true;
      if (!existing.webhookSecret) {
        existing.webhookSecret = generateWebhookSecret();
      }
      return this.monitors.save(existing);
    }

    return this.monitors.save(
      this.monitors.create({
        accountId: input.accountId,
        targetHandle: input.targetHandle,
        webhookUrl: input.webhookUrl,
        eventTypes: input.eventTypes ?? ['tweet.new'],
        webhookSecret: generateWebhookSecret(),
      }),
    );
  }

  async rotateSecret(id: string): Promise<MonitorEntity | null> {
    const m = await this.monitors.findOne({ where: { id } });
    if (!m) return null;
    m.webhookSecret = generateWebhookSecret();
    return this.monitors.save(m);
  }

  async listAll(): Promise<MonitorEntity[]> {
    return this.monitors.find({ order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<MonitorEntity | null> {
    return this.monitors.findOne({ where: { id } });
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.monitors.delete({ id });
    return (result.affected ?? 0) > 0;
  }

  async disable(id: string): Promise<boolean> {
    const result = await this.monitors.update({ id }, { enabled: false });
    return (result.affected ?? 0) > 0;
  }

  async findEnabled(): Promise<MonitorEntity[]> {
    return this.monitors.find({ where: { enabled: true } });
  }

  async updateLastSeen(id: string, tweetUrl: string): Promise<void> {
    await this.monitors.update({ id }, {
      lastCheckAt: new Date(),
      lastTweetUrl: tweetUrl,
    });
  }

  async updateLastCheck(id: string): Promise<void> {
    await this.monitors.update({ id }, { lastCheckAt: new Date() });
  }

  async listDeliveries(monitorId: string, limit = 20): Promise<WebhookDeliveryEntity[]> {
    return this.deliveries.find({
      where: { monitorId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async recordDelivery(
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

function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}
