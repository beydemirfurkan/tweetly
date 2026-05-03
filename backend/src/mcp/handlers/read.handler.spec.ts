import { ReadHandler } from './read.handler';
import { fakeContext } from './__tests__/test-helpers';
import type { XDirectService } from '@/x-automation/x-direct.service';
import type { XBrowserService } from '@/x-automation/browser/x-browser.service';

function mockXDirect(): jest.Mocked<XDirectService> {
  return {
    searchTweets: jest.fn().mockResolvedValue([]),
    getUser: jest.fn().mockResolvedValue({}),
    getTweet: jest.fn().mockResolvedValue({}),
    searchUsers: jest.fn().mockResolvedValue([]),
    getUserFollowers: jest.fn().mockResolvedValue([]),
    getUserFollowing: jest.fn().mockResolvedValue([]),
    getTweetRetweeters: jest.fn().mockResolvedValue([]),
    getTweetQuotes: jest.fn().mockResolvedValue([]),
    getTweetReplies: jest.fn().mockResolvedValue([]),
    getUserMentions: jest.fn().mockResolvedValue([]),
    getXTrending: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<XDirectService>;
}

function mockXBrowser(): jest.Mocked<XBrowserService> {
  return {
    readProfileTweets: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<XBrowserService>;
}

describe('ReadHandler', () => {
  describe('searchTweets', () => {
    it('throws when query is missing', async () => {
      const h = new ReadHandler(mockXDirect(), mockXBrowser());
      await expect(h.searchTweets({}, fakeContext())).rejects.toThrow(/query/);
    });

    it('clamps limit at 50 (the X composer practical max)', async () => {
      const x = mockXDirect();
      const h = new ReadHandler(x, mockXBrowser());
      await h.searchTweets({ query: 'q', limit: 999 }, fakeContext());
      expect(x.searchTweets).toHaveBeenCalledWith('q', 50, 'acc-1');
    });

    it('defaults limit to 20 when omitted', async () => {
      const x = mockXDirect();
      const h = new ReadHandler(x, mockXBrowser());
      await h.searchTweets({ query: 'q' }, fakeContext());
      expect(x.searchTweets).toHaveBeenCalledWith('q', 20, 'acc-1');
    });
  });

  describe('getUser / getTweet validations', () => {
    it('getUser requires handle', async () => {
      const h = new ReadHandler(mockXDirect(), mockXBrowser());
      await expect(h.getUser({}, fakeContext())).rejects.toThrow(/handle/);
    });

    it('getTweet requires /status/ URL', async () => {
      const h = new ReadHandler(mockXDirect(), mockXBrowser());
      await expect(h.getTweet({ tweet_url: 'invalid' }, fakeContext())).rejects.toThrow(/\/status\//);
    });
  });

  describe('getUserTweets', () => {
    it('returns [] short-circuit when no account resolves', async () => {
      const x = mockXDirect();
      const browser = mockXBrowser();
      const ctx = fakeContext({ resolveAccountIdOptional: jest.fn().mockResolvedValue(undefined) });
      const h = new ReadHandler(x, browser);

      const result = await h.getUserTweets({ handle: 'u' }, ctx);

      expect(result).toEqual([]);
      // Browser should NOT be called when no account is available — saves the
      // cost of an empty timeline launch.
      expect(browser.readProfileTweets).not.toHaveBeenCalled();
    });

    it('delegates to xBrowser when an account is resolved', async () => {
      const browser = mockXBrowser();
      const h = new ReadHandler(mockXDirect(), browser);
      await h.getUserTweets({ handle: 'u', limit: 10 }, fakeContext());
      expect(browser.readProfileTweets).toHaveBeenCalledWith('u', 10, 'acc-1');
    });
  });

  describe('searchUsers / getUserFollowers / getUserFollowing / getTweetRetweeters', () => {
    it('passes verifiedOnly through as a boolean (defaulting to false)', async () => {
      const x = mockXDirect();
      const h = new ReadHandler(x, mockXBrowser());
      await h.searchUsers({ query: 'q', verified_only: true }, fakeContext());
      expect(x.searchUsers).toHaveBeenCalledWith('q', 20, 'acc-1', { verifiedOnly: true });

      await h.getUserFollowers({ handle: 'u' }, fakeContext());
      expect(x.getUserFollowers).toHaveBeenCalledWith('u', 50, 'acc-1', { verifiedOnly: false });
    });

    it('clamps user-list limits at 200', async () => {
      const x = mockXDirect();
      const h = new ReadHandler(x, mockXBrowser());
      await h.getUserFollowing({ handle: 'u', limit: 9999 }, fakeContext());
      expect(x.getUserFollowing).toHaveBeenCalledWith('u', 200, 'acc-1', { verifiedOnly: false });
    });

    it('getTweetRetweeters validates tweet_url presence', async () => {
      const h = new ReadHandler(mockXDirect(), mockXBrowser());
      await expect(h.getTweetRetweeters({}, fakeContext())).rejects.toThrow(/tweet_url/);
    });
  });

  describe('getTweetQuotes / getTweetReplies / getUserMentions', () => {
    it('getTweetQuotes requires tweet_url', async () => {
      const h = new ReadHandler(mockXDirect(), mockXBrowser());
      await expect(h.getTweetQuotes({}, fakeContext())).rejects.toThrow(/tweet_url/);
    });

    it('getUserMentions requires handle and clamps limit', async () => {
      const x = mockXDirect();
      const h = new ReadHandler(x, mockXBrowser());
      await expect(h.getUserMentions({}, fakeContext())).rejects.toThrow(/handle/);
      await h.getUserMentions({ handle: 'u', limit: 999 }, fakeContext());
      expect(x.getUserMentions).toHaveBeenCalledWith('u', 50, 'acc-1');
    });
  });

  describe('getXTrending', () => {
    it('passes only the resolved account', async () => {
      const x = mockXDirect();
      const h = new ReadHandler(x, mockXBrowser());
      await h.getXTrending({}, fakeContext());
      expect(x.getXTrending).toHaveBeenCalledWith('acc-1');
    });
  });
});
