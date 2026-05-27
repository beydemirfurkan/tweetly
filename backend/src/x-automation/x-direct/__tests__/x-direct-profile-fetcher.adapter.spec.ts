import type { XDirectReadService } from '../x-direct-read.service';
import { XDirectProfileFetcherAdapter } from '../x-direct-profile-fetcher.adapter';

describe('XDirectProfileFetcherAdapter', () => {
  it('maps XDirectReadService.getUser into a ProfileSnapshot', async () => {
    const reads = {
      getUser: jest.fn().mockResolvedValue({
        handle: 'alice',
        displayName: 'Alice',
        bio: 'hi',
        followersCount: '1.2K',
        followingCount: '99',
        tweetsCount: '500',
        verified: true,
        profileUrl: 'https://x.com/alice',
        profileImageUrl: 'https://pbs.twimg.com/x.jpg',
      }),
    } as unknown as jest.Mocked<XDirectReadService>;

    const adapter = new XDirectProfileFetcherAdapter(reads);
    const snap = await adapter.fetchByAccount('alice');

    expect(reads.getUser).toHaveBeenCalledWith('alice', 'alice');
    expect(snap).toEqual({
      displayName: 'Alice',
      bio: 'hi',
      followersCount: '1.2K',
      followingCount: '99',
      tweetsCount: '500',
      profileImageUrl: 'https://pbs.twimg.com/x.jpg',
      verified: true,
    });
  });

  it('substitutes defaults only for nullish fields (mirrors prior ?? behavior)', async () => {
    // The XDirect.getUser scraper returns '' for missing counts (empty
    // textContent), so the adapter only fills nulls/undefined. Mirrors the
    // pre-refactor ProfileCacheService.refresh contract.
    const reads = {
      getUser: jest.fn().mockResolvedValue({
        handle: 'bob',
        displayName: undefined,
        bio: undefined,
        followersCount: undefined,
        followingCount: undefined,
        tweetsCount: undefined,
        verified: undefined,
        profileUrl: '',
        profileImageUrl: undefined,
      }),
    } as unknown as jest.Mocked<XDirectReadService>;

    const adapter = new XDirectProfileFetcherAdapter(reads);
    const snap = await adapter.fetchByAccount('bob');

    expect(snap.displayName).toBe('');
    expect(snap.followersCount).toBe('0');
    expect(snap.followingCount).toBe('0');
    expect(snap.tweetsCount).toBe('0');
    expect(snap.profileImageUrl).toBe('');
    expect(snap.verified).toBe(false);
  });
});
