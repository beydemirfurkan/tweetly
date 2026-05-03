/**
 * Port that lets `accounts` consume profile data without importing the
 * x-automation module — kills the previous accounts ↔ x-automation cycle
 * by making the dependency one-way through the domain layer.
 *
 * The implementation lives in x-automation and adapts XDirectReadService
 * (browser-based scrape) into this shape; future adapters (e.g. an X API
 * client) can plug in by providing the same token.
 */

export interface ProfileSnapshot {
  displayName: string;
  bio: string;
  followersCount: string;
  followingCount: string;
  tweetsCount: string;
  profileImageUrl: string;
  verified: boolean;
}

export interface IProfileFetcher {
  fetchByAccount(accountId: string): Promise<ProfileSnapshot>;
}

export const PROFILE_FETCHER = Symbol('IProfileFetcher');
