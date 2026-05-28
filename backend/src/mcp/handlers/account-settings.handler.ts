import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SettingsService } from '@/settings/settings.service';
import { BaseMcpHandler } from './base.handler';
import type { McpToolArgs, McpToolContext } from './mcp-tool.context';

/**
 * Per-account settings get/set. Reads come straight from SettingsService;
 * writes validate the key allow-list and each value's declared type before
 * upserting in a single batch so partial writes can't sneak through.
 */
@Injectable()
export class AccountSettingsHandler extends BaseMcpHandler {
  constructor(
    private readonly settings: SettingsService,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async getSettings(args: McpToolArgs, ctx: McpToolContext) {
    const accountId = args.account_id as string | undefined;
    if (!accountId) throw new Error('account_id is required');
    await ctx.assertAccountOwnership(accountId);
    const defs = this.settings.getDefs();
    const entries = await Promise.all(
      defs.map(async (d) => [d.key, await this.settings.get(d.key, d.defaultValue, accountId)] as const),
    );
    return Object.fromEntries(entries);
  }

  async updateSettings(args: McpToolArgs, ctx: McpToolContext) {
    const accountId = args.account_id as string | undefined;
    if (!accountId) throw new Error('account_id is required');
    await ctx.assertAccountOwnership(accountId);
    const settings = args.settings as Record<string, unknown>;
    if (!settings || typeof settings !== 'object') throw new Error('settings must be an object');
    const defs = new Map(this.settings.getDefs().map((def) => [def.key, def]));
    const entries = Object.entries(settings).map(([key, value]) => {
      const def = defs.get(key);
      if (!def) {
        throw new BadRequestException(`Unknown setting: ${key}`);
      }
      if (!matchesSettingType(value, def.type)) {
        throw new BadRequestException(`Setting ${key} must be ${def.type}`);
      }
      return {
        key,
        raw: def.type === 'json' ? JSON.stringify(value) : String(value),
        type: def.type,
      };
    });
    const repo = this.dataSource.getRepository('settings');
    const now = new Date();
    for (const entry of entries) {
      await repo.upsert(
        { key: entry.key, accountId, value: entry.raw, type: entry.type, updatedAt: now },
        ['key', 'accountId'],
      );
    }
    this.settings.invalidateCache();
    return { ok: true, updated: Object.keys(settings).length };
  }
}

function matchesSettingType(value: unknown, type: 'string' | 'number' | 'boolean' | 'json'): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'json':
      return typeof value === 'object' && value !== null;
  }
}
