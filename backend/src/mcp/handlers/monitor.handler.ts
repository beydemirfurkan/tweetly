import { Injectable } from '@nestjs/common';
import { MonitoringService } from '@/monitoring/monitoring.service';
import type { McpToolArgs, McpToolContext } from './mcp-tool.context';

/**
 * Webhook monitor management tools. All write operations enforce
 * ownership through the context's assertAccountOwnership helper before
 * touching the monitor row.
 */
@Injectable()
export class MonitorHandler {
  constructor(private readonly monitoring: MonitoringService) {}

  async createMonitor(args: McpToolArgs, ctx: McpToolContext) {
    const targetHandle = args.target_handle as string;
    const webhookUrl = args.webhook_url as string;
    if (!targetHandle) throw new Error('target_handle is required');
    if (!webhookUrl?.startsWith('http')) throw new Error('webhook_url must be a valid HTTP/HTTPS URL');
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    const monitor = await this.monitoring.create({
      accountId, targetHandle, webhookUrl,
      eventTypes: (args.event_types as string[] | undefined) ?? ['tweet.new'],
    });
    return { ok: true, monitor };
  }

  async listMonitors(_args: McpToolArgs, ctx: McpToolContext) {
    const allowedIds = await ctx.userAccountIdSet();
    const all = await this.monitoring.listAll();
    const filtered = all.filter((m) => allowedIds.has(m.accountId));
    return { count: filtered.length, monitors: filtered };
  }

  async getMonitor(args: McpToolArgs, ctx: McpToolContext) {
    const id = args.monitor_id as string;
    if (!id) throw new Error('monitor_id is required');
    const monitor = await this.monitoring.findById(id);
    if (!monitor) throw new Error(`Monitor ${id} not found`);
    await ctx.assertAccountOwnership(monitor.accountId);
    const deliveries = await this.monitoring.listDeliveries(id, 10);
    return { monitor, recentDeliveries: deliveries };
  }

  async deleteMonitor(args: McpToolArgs, ctx: McpToolContext) {
    const id = args.monitor_id as string;
    if (!id) throw new Error('monitor_id is required');
    const monitor = await this.monitoring.findById(id);
    if (!monitor) throw new Error(`Monitor ${id} not found`);
    await ctx.assertAccountOwnership(monitor.accountId);
    const ok = await this.monitoring.delete(id);
    if (!ok) throw new Error(`Monitor ${id} not found`);
    return { ok: true };
  }

  async pauseMonitor(args: McpToolArgs, ctx: McpToolContext) {
    const id = args.monitor_id as string;
    if (!id) throw new Error('monitor_id is required');
    const monitor = await this.monitoring.findById(id);
    if (!monitor) throw new Error(`Monitor ${id} not found`);
    await ctx.assertAccountOwnership(monitor.accountId);
    const ok = await this.monitoring.disable(id);
    if (!ok) throw new Error(`Monitor ${id} not found`);
    return { ok: true, status: 'paused' };
  }
}
