import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MonitoringService } from '@/monitoring/monitoring.service';
import { redactMonitor } from '@/monitoring/monitor-redactor';
import { checkWebhookUrl } from '@/monitoring/webhook-url-validator';
import { AccountFacade } from './account.facade';
import type { MonitorCreateDto } from '../dto/monitor.dto';

/**
 * Webhook monitor management. All write/read operations enforce ownership
 * through AccountFacade before touching the monitor row.
 */
@Injectable()
export class MonitorFacade {
  constructor(
    private readonly monitoring: MonitoringService,
    private readonly accounts: AccountFacade,
  ) {}

  async listForUser(userId: string) {
    const allowed = new Set(await this.accounts.userAccountIds(userId));
    const all = await this.monitoring.listAll();
    const filtered = all.filter((m) => allowed.has(m.accountId)).map(redactMonitor);
    return { count: filtered.length, monitors: filtered };
  }

  async create(userId: string, body: MonitorCreateDto) {
    if (!body.targetHandle) throw new BadRequestException('targetHandle is required');
    if (!body.webhookUrl) {
      throw new BadRequestException('webhookUrl is required');
    }
    const urlCheck = await checkWebhookUrl(body.webhookUrl);
    if (!urlCheck.ok) {
      throw new BadRequestException({
        message: 'webhookUrl rejected',
        code: urlCheck.reason,
        detail: urlCheck.detail,
      });
    }
    const accountId = await this.accounts.resolveAccountId(userId, body.accountId);
    const monitor = await this.monitoring.create({
      accountId,
      targetHandle: body.targetHandle,
      webhookUrl: body.webhookUrl,
      eventTypes: body.eventTypes ?? ['tweet.new'],
    });
    return {
      ok: true,
      monitor: redactMonitor(monitor),
      webhookSecret: monitor.webhookSecret,
    };
  }

  async getOwnedMonitor(userId: string, id: string) {
    const monitor = await this.findOwned(userId, id);
    const deliveries = await this.monitoring.listDeliveries(id, 20);
    return { monitor: redactMonitor(monitor), recentDeliveries: deliveries };
  }

  async rotateSecret(userId: string, id: string) {
    await this.findOwned(userId, id);
    const rotated = await this.monitoring.rotateSecret(id);
    if (!rotated) throw new NotFoundException(`Monitor ${id} not found`);
    return { ok: true, webhookSecret: rotated.webhookSecret };
  }

  async delete(userId: string, id: string) {
    await this.findOwned(userId, id);
    const ok = await this.monitoring.delete(id);
    if (!ok) throw new NotFoundException(`Monitor ${id} not found`);
    return { ok: true };
  }

  private async findOwned(userId: string, id: string) {
    const monitor = await this.monitoring.findById(id);
    if (!monitor) throw new NotFoundException(`Monitor ${id} not found`);
    await this.accounts.assertAccountOwnership(userId, monitor.accountId);
    return monitor;
  }
}
