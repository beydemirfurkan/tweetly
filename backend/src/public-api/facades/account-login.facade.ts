import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AccountsService } from '@/accounts/accounts.service';
import { LoginJobsRepository } from '@/x-automation/login/login-jobs.repository';
import { CredentialCipherService } from '@common/crypto/credential-cipher.service';
import {
  assertBase32Secret,
  normalizeProxyCountry,
  normalizeUsername,
  requireString,
} from '@/x-automation/login/login-validation';
import type {
  AccountConnectDto,
  AccountReauthDto,
  LoginJobAcceptedDto,
  LoginJobResponseDto,
} from '../dto/account-login.dto';

/**
 * Owns the X login lifecycle exposed via the public REST API:
 * connect / reauth job creation, status polling, and user-initiated
 * cancellation. Cooldown gating is shared with MCP through
 * `LoginJobsRepository.findActiveCooldown` — assertions here translate
 * the result into HTTP 429.
 */
@Injectable()
export class AccountLoginFacade {
  constructor(
    private readonly accounts: AccountsService,
    private readonly loginJobs: LoginJobsRepository,
    private readonly cipher: CredentialCipherService,
  ) {}

  async createConnectJob(userId: string, body: AccountConnectDto): Promise<LoginJobAcceptedDto> {
    const username = normalizeUsername(body.username);
    const email = optionalTrimmedString(body.email);
    const password = requireString(body.password, 'password');
    const totpSecretRaw = body.totpSecret?.trim() || null;
    if (totpSecretRaw) assertBase32Secret(totpSecretRaw, 'totpSecret');
    const proxyCountry = resolveLoginProxyCountry(body.proxyCountry, process.env.LOGIN_DEFAULT_PROXY_COUNTRY);

    // X account ids are stored lowercase; reject a second 'connect' for an
    // account the user already owns and steer them to /reauth so we don't
    // silently overwrite their cookies via upsertAccountWithCookies.
    const candidateAccountId = username.toLowerCase();
    const existing = await this.accounts.findByIdForUser(candidateAccountId, userId);
    if (existing) {
      throw new HttpException(
        {
          message: 'Account is already connected. Use the reauth flow to refresh its session.',
          code: 'account_already_connected',
          existingAccountId: existing.id,
        },
        HttpStatus.CONFLICT,
      );
    }

    await this.assertLoginCooldownIsClear(userId, username);

    const { id } = await this.loginJobs.create({
      userId,
      kind: 'connect',
      targetAccountId: null,
      username,
      email,
      encryptedPassword: this.cipher.encrypt(password),
      encryptedTotpSecret: totpSecretRaw ? this.cipher.encrypt(totpSecretRaw) : null,
      saveTotpSecret: Boolean(body.saveTotpSecret),
      proxyCountry,
    });
    return { jobId: id, kind: 'connect', pollUrl: `/api/v1/accounts/login-jobs/${id}` };
  }

  async createReauthJob(userId: string, accountIdParam: string, body: AccountReauthDto): Promise<LoginJobAcceptedDto> {
    const accountId = accountIdParam.trim().toLowerCase();
    const account = await this.accounts.findByIdForUser(accountId, userId);
    if (!account) throw new NotFoundException(`Account ${accountIdParam} not found`);

    const password = requireString(body.password, 'password');
    const totpSecretRaw = body.totpSecret?.trim() || null;
    if (totpSecretRaw) assertBase32Secret(totpSecretRaw, 'totpSecret');
    const encryptedTotp = totpSecretRaw
      ? this.cipher.encrypt(totpSecretRaw)
      : account.totpSecretEncrypted;
    const proxyCountry = resolveLoginProxyCountry(
      body.proxyCountry,
      account.proxyCountry ?? process.env.LOGIN_DEFAULT_PROXY_COUNTRY,
    );

    await this.assertLoginCooldownIsClear(userId, account.id);

    const { id: jobId } = await this.loginJobs.create({
      userId,
      kind: 'reauth',
      targetAccountId: account.id,
      username: account.id,
      email: body.email?.trim() || null,
      encryptedPassword: this.cipher.encrypt(password),
      encryptedTotpSecret: encryptedTotp,
      saveTotpSecret:
        Boolean(body.saveTotpSecret) || (totpSecretRaw === null && Boolean(account.totpSecretEncrypted)),
      proxyCountry,
    });
    return { jobId, kind: 'reauth', pollUrl: `/api/v1/accounts/login-jobs/${jobId}` };
  }

  async getLoginJob(userId: string, jobId: string): Promise<LoginJobResponseDto> {
    const job = await this.loginJobs.findByIdForUser(jobId, userId);
    if (!job) throw new NotFoundException(`Login job ${jobId} not found`);
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      targetAccountId: job.targetAccountId,
      failureReason: job.failureReason,
      failureDetail: job.failureDetail,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    };
  }

  /**
   * User-initiated cancellation. Flips a queued/running job to 'cancelled' if
   * it belongs to the calling user. Returns the prior status so callers can
   * tell whether the worker was already executing the row (useful for
   * client-side messaging — "stopped before pickup" vs "interrupting login").
   * Throws NotFound when the row doesn't exist or isn't yours. Throws 409
   * when the row is already in a terminal state (success/failed/cancelled).
   */
  async cancelLoginJob(
    userId: string,
    jobId: string,
  ): Promise<{ ok: true; status: 'cancelled'; priorStatus: 'queued' | 'running' }> {
    const result = await this.loginJobs.cancelForUser(jobId, userId);
    if ('reason' in result) {
      if (result.reason === 'not_found') {
        throw new NotFoundException(`Login job ${jobId} not found`);
      }
      throw new HttpException(
        { message: `Login job ${jobId} is already in a terminal state.`, code: 'login_job_already_terminal' },
        HttpStatus.CONFLICT,
      );
    }
    return { ok: true, status: 'cancelled', priorStatus: result.priorStatus as 'queued' | 'running' };
  }

  private async assertLoginCooldownIsClear(userId: string, username: string): Promise<void> {
    const cooldown = await this.loginJobs.findActiveCooldown(userId, username);
    if (!cooldown) return;
    throw new HttpException(
      {
        message: cooldown.manualReviewRequired
          ? 'Login temporarily blocked after repeated failures; manual review recommended.'
          : 'Login temporarily blocked after a recent failure.',
        retryAfterSec: cooldown.retryAfterSec,
        retryAt: cooldown.retryAt,
        failureCount: cooldown.failureCount,
        manualReviewRequired: cooldown.manualReviewRequired,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

function optionalTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveLoginProxyCountry(raw: unknown, fallback: string | null | undefined): string | null {
  return normalizeProxyCountry(raw ?? fallback ?? null);
}
