import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountProfileEntity } from '@persistence/entities/account-profile.entity';
import { type IProfileFetcher, PROFILE_FETCHER } from '@domain/ports/profile-fetcher.port';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class ProfileCacheService {
  private readonly log = new Logger(ProfileCacheService.name);

  constructor(
    @InjectRepository(AccountProfileEntity)
    private readonly repo: Repository<AccountProfileEntity>,
    @Inject(PROFILE_FETCHER)
    private readonly fetcher: IProfileFetcher,
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
    const snapshot = await this.fetcher.fetchByAccount(accountId);

    const entity = this.repo.create({
      accountId,
      displayName: snapshot.displayName,
      bio: snapshot.bio,
      followersCount: snapshot.followersCount,
      followingCount: snapshot.followingCount,
      tweetsCount: snapshot.tweetsCount,
      profileImageUrl: snapshot.profileImageUrl,
      verified: snapshot.verified,
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
