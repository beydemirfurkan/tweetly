import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountsService } from '@/accounts/accounts.service';
import { CredentialCipherService } from '@common/crypto/credential-cipher.service';
import { LoginJobsRepository } from '@/x-automation/login/login-jobs.repository';
import {
  assertBase32Secret,
  normalizeUsername,
  requireString,
} from '@/x-automation/login/login-validation';
import { BaseMcpHandler } from './base.handler';
import type { McpToolArgs, McpToolContext } from './mcp-tool.context';

/**
 * Login lifecycle for an X account: brand-new connect, reauth of an
 * existing connection, and polling the resulting background job. All
 * three enqueue work through LoginJobsRepository; the cooldown gate lives
 * on the context so tests can stub it.
 */
@Injectable()
export class LoginHandler extends BaseMcpHandler {
  constructor(
    private readonly accounts: AccountsService,
    private readonly cipher: CredentialCipherService,
    private readonly loginJobs: LoginJobsRepository,
  ) {
    super();
  }

  async connectXAccount(args: McpToolArgs, ctx: McpToolContext) {
    const username = normalizeUsername(args.username);
    const email = typeof args.email === 'string' && args.email.trim() ? args.email.trim() : null;
    const password = requireString(args.password, 'password');
    const t = args.totp_secret;
    const totpRaw = typeof t === 'string' && t.trim() ? t.trim() : null;
    if (totpRaw) assertBase32Secret(totpRaw, 'totp_secret');

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

    const password = requireString(args.password, 'password');
    const t = args.totp_secret;
    const totpRaw = typeof t === 'string' && t.trim() ? t.trim() : null;
    if (totpRaw) assertBase32Secret(totpRaw, 'totp_secret');

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
}
