import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountsService } from '@/accounts/accounts.service';
import { AdminApiService } from '@/admin-api/admin-api.service';
import { SettingsService } from '@/settings/settings.service';
import { CredentialCipherService } from '@common/crypto/credential-cipher.service';
import { LoginJobsRepository } from '@/x-automation/login/login-jobs.repository';
import {
  LoginValidationError,
  assertBase32Secret,
  normalizeUsername,
  requireString,
} from '@/x-automation/login/login-validation';
import type { ActionType, ActionStatus } from '@domain/types/action.types';
import { ACTION_TYPES, ACTION_STATUSES } from '@domain/types/action.types';
import type { McpToolArgs, McpToolContext } from './mcp-tool.context';

/**
 * Account-level tools: listing, health, login lifecycle (connect/reauth/poll),
 * action queue management, and settings. Login flows enqueue jobs through
 * LoginJobsRepository; cooldown checks live in the context helper so tests
 * can stub them.
 */
@Injectable()
export class AccountHandler {
  constructor(
    private readonly accounts: AccountsService,
    private readonly adminApi: AdminApiService,
    private readonly settings: SettingsService,
    private readonly cipher: CredentialCipherService,
    private readonly loginJobs: LoginJobsRepository,
    private readonly dataSource: DataSource,
  ) {}

  async getAccounts(_args: McpToolArgs, ctx: McpToolContext) {
    const list = await this.accounts.listAllForUser(ctx.userId);
    return {
      count: list.length,
      accounts: list.map((a) => ({
        id: a.id,
        displayName: a.displayName,
        status: a.status,
        hasAuthToken: Boolean(a.authToken),
        createdAt: a.createdAt,
        lastUsedAt: a.lastUsedAt,
      })),
    };
  }

  async getAccountHealth(args: McpToolArgs, ctx: McpToolContext) {
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    const account = await this.accounts.findByIdForUser(accountId, ctx.userId);
    if (!account) throw new Error(`Account not found: ${accountId}`);
    const health = await this.accounts.getSessionHealth(accountId);
    return {
      accountId: account.id,
      status: account.status,
      displayName: account.displayName,
      ...health,
    };
  }

  async connectXAccount(args: McpToolArgs, ctx: McpToolContext) {
    let username: string, email: string | null, password: string;
    let totpRaw: string | null;
    try {
      username = normalizeUsername(args.username);
      email = typeof args.email === 'string' && args.email.trim() ? args.email.trim() : null;
      password = requireString(args.password, 'password');
      const t = args.totp_secret;
      totpRaw = typeof t === 'string' && t.trim() ? t.trim() : null;
      if (totpRaw) assertBase32Secret(totpRaw, 'totp_secret');
    } catch (e) {
      if (e instanceof LoginValidationError) throw new Error(e.message);
      throw e;
    }
    await ctx.assertLoginCooldownIsClear(username);
    const { id } = await this.loginJobs.create({
      userId: ctx.userId,
      kind: 'connect',
      targetAccountId: null,
      username,
      email,
      encryptedPassword: this.cipher.encrypt(password),
      encryptedTotpSecret: totpRaw ? this.cipher.encrypt(totpRaw) : null,
      saveTotpSecret: Boolean(args.save_totp_secret),
      proxyCountry: null,
    });
    return {
      job_id: id,
      kind: 'connect',
      poll_with: { tool: 'get_x_login_job', args: { job_id: id } },
      hint: 'Poll every 2 seconds. Login typically completes in 20-40s.',
    };
  }

  async reauthXAccount(args: McpToolArgs, ctx: McpToolContext) {
    const accountIdRaw = requireString(args.account_id, 'account_id');
    const accountId = accountIdRaw.trim().toLowerCase();
    const account = await this.accounts.findByIdForUser(accountId, ctx.userId);
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);

    let password: string, totpRaw: string | null;
    try {
      password = requireString(args.password, 'password');
      const t = args.totp_secret;
      totpRaw = typeof t === 'string' && t.trim() ? t.trim() : null;
      if (totpRaw) assertBase32Secret(totpRaw, 'totp_secret');
    } catch (e) {
      if (e instanceof LoginValidationError) throw new Error(e.message);
      throw e;
    }
    const encryptedTotp = totpRaw
      ? this.cipher.encrypt(totpRaw)
      : account.totpSecretEncrypted;

    const emailArg = args.email;
    const email = typeof emailArg === 'string' && emailArg.trim() ? emailArg.trim() : null;

    await ctx.assertLoginCooldownIsClear(account.id);

    const { id } = await this.loginJobs.create({
      userId: ctx.userId,
      kind: 'reauth',
      targetAccountId: account.id,
      username: account.id,
      email,
      encryptedPassword: this.cipher.encrypt(password),
      encryptedTotpSecret: encryptedTotp,
      saveTotpSecret: Boolean(args.save_totp_secret) || (totpRaw === null && Boolean(account.totpSecretEncrypted)),
      proxyCountry: null,
    });
    return {
      job_id: id,
      kind: 'reauth',
      poll_with: { tool: 'get_x_login_job', args: { job_id: id } },
    };
  }

  async getXLoginJob(args: McpToolArgs, ctx: McpToolContext) {
    const jobId = requireString(args.job_id, 'job_id');
    const job = await this.loginJobs.findByIdForUser(jobId, ctx.userId);
    if (!job) throw new NotFoundException(`Login job ${jobId} not found`);
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      target_account_id: job.targetAccountId,
      failure_reason: job.failureReason,
      failure_detail: job.failureDetail,
      created_at: job.createdAt,
      started_at: job.startedAt,
      finished_at: job.finishedAt,
    };
  }

  async listActions(args: McpToolArgs, ctx: McpToolContext) {
    const type = args.type as ActionType;
    if (!ACTION_TYPES.includes(type)) throw new Error(`type must be one of: ${ACTION_TYPES.join(', ')}`);
    const limit = Math.min(Math.max(1, Number(args.limit ?? 50)), 200);
    const rawStatus = args.status as string | undefined;
    const status = rawStatus && ACTION_STATUSES.includes(rawStatus as ActionStatus)
      ? (rawStatus as ActionStatus)
      : undefined;
    const allowedIds = await ctx.userAccountIdSet();
    if (allowedIds.size === 0) return { type, count: 0, rows: [] };

    const argAccountId = args.account_id as string | undefined;
    if (argAccountId && !allowedIds.has(argAccountId)) {
      throw new Error(`Account ${argAccountId} not found`);
    }
    const rows = await this.adminApi.listActions(type, status, argAccountId, limit);
    const filtered = argAccountId ? rows : rows.filter((r) => allowedIds.has(r.account_id));
    return { type, count: filtered.length, rows: filtered };
  }

  async cancelAction(args: McpToolArgs, ctx: McpToolContext) {
    const type = args.type as ActionType;
    const id = args.action_id as string;
    if (!ACTION_TYPES.includes(type)) throw new Error(`Unknown action type: ${type}`);
    await ctx.assertActionOwnership(type, id);
    const ok = await this.adminApi.cancelAction(type, id);
    if (!ok) throw new Error(`Action ${id} not found or not cancellable`);
    return { ok: true, id, status: 'cancelled' };
  }

  async replayAction(args: McpToolArgs, ctx: McpToolContext) {
    const type = args.type as ActionType;
    const id = args.action_id as string;
    if (!ACTION_TYPES.includes(type)) throw new Error(`Unknown action type: ${type}`);
    await ctx.assertActionOwnership(type, id);
    const ok = await this.adminApi.replayAction(type, id);
    if (!ok) throw new Error(`Action ${id} not found or not replayable`);
    return { ok: true, id, status: 'pending' };
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
    const repo = this.dataSource.getRepository('settings');
    const now = new Date();
    for (const [key, value] of Object.entries(settings)) {
      const type = inferType(value);
      const raw = type === 'json' ? JSON.stringify(value) : String(value);
      await repo.upsert(
        { key, accountId, value: raw, type, updatedAt: now },
        ['key', 'accountId'],
      );
    }
    this.settings.invalidateCache();
    return { ok: true, updated: Object.keys(settings).length };
  }
}

function inferType(value: unknown): 'string' | 'number' | 'boolean' | 'json' {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'string';
}
