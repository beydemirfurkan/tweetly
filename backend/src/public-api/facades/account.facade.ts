import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountsService } from '@/accounts/accounts.service';
import { ProfileCacheService } from '@/accounts/profile-cache.service';
import { AdminApiService } from '@/admin-api/admin-api.service';
import { LoginJobsRepository } from '@/x-automation/login/login-jobs.repository';
import {
  CookieHealthCheckService,
  type CookieHealthInput,
  type CookieHealthResult,
} from '@/x-automation/login/cookie-health-check.service';
import { CredentialCipherService } from '@common/crypto/credential-cipher.service';
import {
  assertBase32Secret,
  normalizeProxyCountry,
  normalizeUsername,
  requireString,
} from '@/x-automation/login/login-validation';
import type { AccountEntity } from '@persistence/entities/account.entity';
import type { AccountStatus } from '@domain/types/account.types';
import type {
  AccountUpsertDto,
  AccountsResponseDto,
  RedactedAccountDto,
  SessionHealthDto,
} from '../dto/account.dto';
import type {
  AccountConnectDto,
  AccountReauthDto,
  LoginJobAcceptedDto,
  LoginJobResponseDto,
} from '../dto/account-login.dto';

const ACCOUNT_STATUSES: AccountStatus[] = ['active', 'paused', 'banned'];

/**
 * The account.facade is the single entry point that public-api controllers use
 * to talk to the underlying accounts/profile/login modules. Controllers MUST
 * NOT inject those services directly — facade boundaries are enforced by
 * eslint import/no-restricted-paths after this faz lands.
 */
@Injectable()
export class AccountFacade {
  constructor(
    private readonly accounts: AccountsService,
    private readonly profileCache: ProfileCacheService,
    private readonly admin: AdminApiService,
    private readonly loginJobs: LoginJobsRepository,
    private readonly cipher: CredentialCipherService,
    private readonly cookieHealth: CookieHealthCheckService,
  ) {}

  validateCookies(input: CookieHealthInput): Promise<CookieHealthResult> {
    return this.cookieHealth.check(input);
  }

  // ── Resolution / ownership ────────────────────────────────────────────

  async resolveAccountId(userId: string, candidate?: string): Promise<string> {
    if (candidate) {
      const acct = await this.accounts.findByIdForUser(candidate, userId);
      if (!acct) throw new NotFoundException(`Account ${candidate} not found`);
      return acct.id;
    }
    const active = await this.accounts.listActiveForUser(userId);
    if (active.length === 0) {
      throw new BadRequestException('no active account; specify "account" or connect one');
    }
    return active[0].id;
  }

  async resolveAccountIdOptional(userId: string, candidate?: string): Promise<string | undefined> {
    if (!candidate) {
      const active = await this.accounts.listActiveForUser(userId);
      return active[0]?.id;
    }
    return this.resolveAccountId(userId, candidate);
  }

  async assertAccountOwnership(userId: string, accountId: string): Promise<void> {
    const acct = await this.accounts.findByIdForUser(accountId, userId);
    if (!acct) throw new NotFoundException(`Account ${accountId} not found`);
  }

  async userAccountIds(userId: string): Promise<string[]> {
    const all = await this.accounts.listAllForUser(userId);
    return all.map((a) => a.id);
  }

  // ── Listing / CRUD ────────────────────────────────────────────────────

  async listForUser(userId: string): Promise<AccountsResponseDto> {
    const list = await this.accounts.listAllForUser(userId);
    const ids = list.map((a) => a.id);
    const [health, profiles] = await Promise.all([
      this.accounts.getSessionHealthForAccounts(ids),
      this.profileCache.getMany(ids),
    ]);
    return {
      count: list.length,
      accounts: list.map((a) => {
        const dto = redact(a, health.get(a.id) ?? defaultHealth());
        const p = profiles.get(a.id);
        dto.profile = p
          ? {
              displayName: p.displayName,
              bio: p.bio,
              followersCount: p.followersCount,
              followingCount: p.followingCount,
              tweetsCount: p.tweetsCount,
              profileImageUrl: p.profileImageUrl,
              verified: p.verified,
              fetchedAt: p.fetchedAt,
            }
          : null;
        return dto;
      }),
    };
  }

  async refreshProfile(userId: string, accountId: string) {
    await this.assertAccountOwnership(userId, accountId);
    const profile = await this.profileCache.refresh(accountId);
    return {
      ok: true,
      profile: {
        displayName: profile.displayName,
        bio: profile.bio,
        followersCount: profile.followersCount,
        followingCount: profile.followingCount,
        tweetsCount: profile.tweetsCount,
        profileImageUrl: profile.profileImageUrl,
        verified: profile.verified,
        fetchedAt: profile.fetchedAt,
      },
    };
  }

  async deleteAccount(userId: string, accountId: string) {
    const ok = await this.accounts.deleteAccount(accountId, userId);
    if (!ok) throw new NotFoundException(`Account ${accountId} not found`);
    return { ok: true };
  }

  async upsertAccount(userId: string, accountId: string, body: AccountUpsertDto) {
    const id = accountId.trim();
    if (!id) throw new BadRequestException('account id is required');
    if (body.status && !ACCOUNT_STATUSES.includes(body.status)) {
      throw new BadRequestException(`status must be one of: ${ACCOUNT_STATUSES.join(', ')}`);
    }
    await this.assertUpsertCookiesBelongToAccount(userId, id, body);
    try {
      const account = await this.accounts.upsertAccount({
        id,
        userId,
        displayName: body.displayName,
        authToken: typeof body.authToken === 'string' ? body.authToken.trim() || undefined : undefined,
        authMulti: body.authMulti,
        ct0: body.ct0,
        twid: body.twid,
        status: body.status,
      });
      return { ok: true, account: redact(account, defaultHealth()) };
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Account could not be saved');
    }
  }

  async getSummary(userId: string) {
    const userAccounts = await this.accounts.listAllForUser(userId);
    const accountIds = userAccounts.map((a) => a.id);
    const [queue, succeeded24h] = await Promise.all([
      this.admin.getQueueDepthForAccounts(accountIds),
      this.admin.getRecentSucceededCount(accountIds, 24 * 60 * 60 * 1000),
    ]);
    const totalPending = queue.reduce((s, q) => s + q.pending, 0);
    const totalDead = queue.reduce((s, q) => s + q.dead, 0);
    return {
      accounts: {
        total: userAccounts.length,
        active: userAccounts.filter((a) => a.status === 'active').length,
        paused: userAccounts.filter((a) => a.status === 'paused').length,
        banned: userAccounts.filter((a) => a.status === 'banned').length,
      },
      queue: { byType: queue, totalPending, totalDead },
      activity: { succeededLast24h: succeeded24h },
    };
  }

  // ── Login lifecycle ───────────────────────────────────────────────────

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

  private async assertUpsertCookiesBelongToAccount(
    userId: string,
    accountId: string,
    body: AccountUpsertDto,
  ): Promise<void> {
    const shouldValidateCookies =
      body.authToken !== undefined || body.ct0 !== undefined || body.twid !== undefined;
    if (!shouldValidateCookies) return;

    const existing = await this.accounts.findByIdForUser(accountId, userId);
    const authToken =
      typeof body.authToken === 'string' ? body.authToken.trim() : existing?.authToken ?? '';
    const ct0 = typeof body.ct0 === 'string' ? body.ct0.trim() : existing?.ct0 ?? '';
    const twid = body.twid !== undefined ? body.twid : existing?.twid ?? null;

    const result = await this.cookieHealth.check({
      authToken,
      ct0,
      twid,
    });
    if (!result.ok) {
      throw new BadRequestException({
        message: 'Cookie validation failed.',
        code: 'cookie_validation_failed',
        reason: result.reason,
        detail: result.detail,
      });
    }

    if (result.screenName?.toLowerCase() !== accountId.toLowerCase()) {
      throw new BadRequestException({
        message: `Cookies belong to @${result.screenName}, not @${accountId}.`,
        code: 'cookie_account_mismatch',
        screenName: result.screenName,
      });
    }
  }
}

function redact(account: AccountEntity, session: SessionHealthDto): RedactedAccountDto {
  return {
    id: account.id,
    displayName: account.displayName,
    status: account.status,
    hasAuthToken: Boolean(account.authToken),
    hasAuthMulti: Boolean(account.authMulti),
    hasCt0: Boolean(account.ct0),
    hasTwid: Boolean(account.twid),
    createdAt: account.createdAt,
    lastUsedAt: account.lastUsedAt,
    session,
    profile: null,
  };
}

function defaultHealth(): SessionHealthDto {
  return {
    health: 'unknown',
    lastCheckAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    authFailureCount: 0,
  };
}

function optionalTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveLoginProxyCountry(raw: unknown, fallback: string | null | undefined): string | null {
  return normalizeProxyCountry(raw ?? fallback ?? null);
}
