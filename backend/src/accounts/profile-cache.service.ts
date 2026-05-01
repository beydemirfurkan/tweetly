import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountProfileEntity } from '../persistence/entities/account-profile.entity';
import { XDirectService } from '../x-automation/x-direct.service';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class ProfileCacheService {
  private readonly log = new Logger(ProfileCacheService.name);

  constructor(
    @InjectRepository(AccountProfileEntity)
    private readonly repo: Repository<AccountProfileEntity>,
    @Inject(forwardRef(() => XDirectService))
    private readonly xDirect: XDirectService,
  ) {}

  async get(accountId: string): Promise<AccountProfileEntity | null> {
    return this.repo.findOne({ where: { accountId } });
  }

  async getMany(accountIds: string[]): Promise<Map<string, AccountProfileEntity>> {
    const map = new Map<string, AccountProfileEntity>();
    if (accountIds.length === 0) return map;
    const rows = await this.repo.find({
      where: accountIds.map((id) => ({ accountId: id })),
    });
    for (const row of rows) map.set(row.accountId, row);
    return map;
  }

  async refresh(accountId: string): Promise<AccountProfileEntity> {
    this.log.log(`Refreshing profile cache for @${accountId}`);
    const result = await this.xDirect.getUser(accountId, accountId);

    const entity = this.repo.create({
      accountId,
      displayName: result.displayName ?? '',
      bio: result.bio ?? '',
      followersCount: result.followersCount ?? '0',
      followingCount: result.followingCount ?? '0',
      tweetsCount: result.tweetsCount ?? '0',
      profileImageUrl: result.profileImageUrl ?? '',
      verified: result.verified ?? false,
      fetchedAt: new Date(),
    });

    return this.repo.save(entity);
  }

  async refreshIfStale(accountId: string): Promise<AccountProfileEntity> {
    const existing = await this.get(accountId);
    if (existing) {
      const age = Date.now() - existing.fetchedAt.getTime();
      if (age < CACHE_TTL_MS) return existing;
    }
    return this.refresh(accountId);
  }

  async refreshInBackground(accountId: string): Promise<void> {
    this.refreshIfStale(accountId).catch((err) => {
      this.log.warn(`Background profile refresh failed for @${accountId}: ${err instanceof Error ? err.message : err}`);
    });
  }

  async delete(accountId: string): Promise<void> {
    await this.repo.delete({ accountId });
  }
}
