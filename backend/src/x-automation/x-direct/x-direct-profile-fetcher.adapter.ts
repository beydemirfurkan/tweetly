import { Injectable } from '@nestjs/common';
import type { IProfileFetcher, ProfileSnapshot } from '@domain/ports/profile-fetcher.port';
import { XDirectReadService } from './x-direct-read.service';

/**
 * Adapter exposing XDirectReadService.getUser as the IProfileFetcher port,
 * so accounts/ProfileCacheService can refresh profiles without taking a
 * direct dependency on the x-automation module.
 *
 * Registered against the PROFILE_FETCHER token in ProfileFetcherModule.
 */
@Injectable()
export class XDirectProfileFetcherAdapter implements IProfileFetcher {
  constructor(private readonly reads: XDirectReadService) {}

  async fetchByAccount(accountId: string): Promise<ProfileSnapshot> {
    const u = await this.reads.getUser(accountId, accountId);
    return {
      displayName: u.displayName ?? '',
      bio: u.bio ?? '',
      followersCount: u.followersCount ?? '0',
      followingCount: u.followingCount ?? '0',
      tweetsCount: u.tweetsCount ?? '0',
      profileImageUrl: u.profileImageUrl ?? '',
      verified: u.verified ?? false,
    };
  }
}
