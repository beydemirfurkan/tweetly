import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountsService } from '@/accounts/accounts.service';
import { AccountAccessService } from '@/accounts/application/account-access.service';
import { ProfileCacheService } from '@/accounts/profile-cache.service';
import {
  CookieHealthCheckService,
  type CookieHealthInput,
  type CookieHealthResult,
} from '@/x-automation/login/cookie-health-check.service';
import { AccountSummaryService, type AccountSummaryDto } from './account-summary.service';
import type { AccountEntity } from '@persistence/entities/account.entity';
import type { AccountStatus } from '@domain/types/account.types';
import type {
  AccountUpsertDto,
  AccountsResponseDto,
  RedactedAccountDto,
  SessionHealthDto,
} from '../dto/account.dto';

const ACCOUNT_STATUSES: AccountStatus[] = ['active', 'paused', 'banned'];

/**
 * The account.facade is the single entry point that public-api controllers use
 * for non-login account flows (list, refresh-profile, delete, upsert, summary,
 * cookie pre-flight). Controllers MUST NOT inject the underlying services
 * directly — facade boundaries are enforced by eslint import/no-restricted-paths.
 *
 * Login lifecycle lives in AccountLoginFacade; ownership/access resolution in
 * AccountsModule application services; summary in AccountSummaryService, and this facade
 * composes them where it needs to.
 */
@Injectable()
export class AccountFacade {
  constructor(
    private readonly accounts: AccountsService,
    private readonly access: AccountAccessService,
    private readonly profileCache: ProfileCacheService,
    private readonly summary: AccountSummaryService,
    private readonly cookieHealth: CookieHealthCheckService,
  ) {}

  validateCookies(input: CookieHealthInput): Promise<CookieHealthResult> {
    return this.cookieHealth.check(input);
  }

  // ── Resolution / ownership (delegated to AccountsModule application) ───

  async resolveAccountId(userId: string, candidate?: string): Promise<string> {
    return this.access.resolveAccountId(userId, candidate);
  }

  async resolveAccountIdOptional(userId: string, candidate?: string): Promise<string | undefined> {
    return this.access.resolveAccountIdOptional(userId, candidate);
  }

  async assertAccountOwnership(userId: string, accountId: string): Promise<void> {
    await this.access.assertAccountOwnership(userId, accountId);
  }

  userAccountIds(userId: string): Promise<string[]> {
    return this.access.userAccountIds(userId);
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

  getSummary(userId: string): Promise<AccountSummaryDto> {
    return this.summary.getSummary(userId);
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
