import { XDirectService } from './x-direct.service';
import { mockXBrowserService } from '../test/mocks/x-browser.mock';

const SEL = {
  tweetArticle: '[data-testid="tweet"]',
  likeButton: '[data-testid="like"]',
  unlikeButton: '[data-testid="unlike"]',
  retweetButton: '[data-testid="retweet"]',
  unretweetConfirm: '[data-testid="unretweetConfirm"]',
  moreActionsButton: '[data-testid="more"]',
  dmTextarea: '[data-testid="dmCompose"]',
  dmSendButton: '[data-testid="dmSend"]',
  userName: '[data-testid="UserName"]',
  userDescription: '[data-testid="UserDescription"]',
  userFollowersCount: '[data-testid="followers"]',
  userFollowingCount: '[data-testid="following"]',
  unfollowButton: jest.fn().mockReturnValue('[data-testid="unfollow"]'),
};

function createService() {
  const { service: browser, page, context } = mockXBrowserService();
  const accounts = {
    listActive: jest.fn().mockResolvedValue([{ id: 'acc-default' }]),
  };
  const service = new XDirectService(browser as any, SEL as any, accounts as any);
  return { service, browser, page, context, accounts };
}

describe('XDirectService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('resolveAccountId (via public methods)', () => {
    it('uses provided accountId without calling accounts service', async () => {
      const { service, browser, accounts } = createService();
      browser.launch.mockResolvedValue({ context: { close: jest.fn() }, page: { goto: jest.fn().mockResolvedValue(null), waitForSelector: jest.fn().mockResolvedValue(null), locator: jest.fn().mockReturnValue({ count: jest.fn().mockResolvedValue(1), first: jest.fn().mockReturnThis(), waitFor: jest.fn().mockResolvedValue(null), click: jest.fn().mockResolvedValue(null) }) } as any });

      // unlikeTweet with explicit accountId should not call listActive
      const page2: any = { goto: jest.fn().mockResolvedValue(null), waitForSelector: jest.fn().mockResolvedValue(null), locator: jest.fn().mockReturnValue({ count: jest.fn().mockResolvedValue(1), first: jest.fn().mockReturnThis(), waitFor: jest.fn().mockResolvedValue(null), click: jest.fn().mockResolvedValue(null) }) };
      browser.launch.mockResolvedValue({ context: { close: jest.fn() }, page: page2 });

      await service.unlikeTweet('https://x.com/u/status/1', 'explicit-acc');
      expect(accounts.listActive).not.toHaveBeenCalled();
      expect(browser.launch).toHaveBeenCalledWith('explicit-acc');
    });

    it('falls back to first active account when no accountId given', async () => {
      const { service, browser, accounts } = createService();
      const page2: any = { goto: jest.fn().mockResolvedValue(null), waitForSelector: jest.fn().mockResolvedValue(null), locator: jest.fn().mockReturnValue({ count: jest.fn().mockResolvedValue(1), first: jest.fn().mockReturnThis(), waitFor: jest.fn().mockResolvedValue(null), click: jest.fn().mockResolvedValue(null) }) };
      browser.launch.mockResolvedValue({ context: { close: jest.fn() }, page: page2 });

      await service.unlikeTweet('https://x.com/u/status/1');
      expect(accounts.listActive).toHaveBeenCalled();
      expect(browser.launch).toHaveBeenCalledWith('acc-default');
    });

    it('throws when no active accounts configured', async () => {
      const { service, accounts } = createService();
      accounts.listActive.mockResolvedValue([]);

      await expect(service.getXTrending()).rejects.toThrow('No active accounts configured');
    });
  });

  describe('browser.release called in finally', () => {
    it('releases browser even when page.goto throws', async () => {
      const { service, browser, context } = createService();
      const fakePage: any = { goto: jest.fn().mockRejectedValue(new Error('nav failed')), waitForSelector: jest.fn() };
      browser.launch.mockResolvedValue({ context, page: fakePage });

      await expect(service.searchTweets('query')).rejects.toThrow();
      expect(browser.release).toHaveBeenCalledWith(context);
    });
  });

  describe('searchTweets', () => {
    it('navigates to search URL with encoded query', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });

      await service.searchTweets('hello world', 5, 'acc-1');

      expect(page.goto).toHaveBeenCalledWith(
        expect.stringContaining('hello%20world'),
        expect.any(Object),
      );
    });

    it('returns result from page.evaluate', async () => {
      const { service, browser, page } = createService();
      const fakeTweet = { url: 'https://x.com/u/status/1', text: 'test', handle: 'u', displayName: 'U', likeCount: '1', retweetCount: '0', replyCount: '0', postedAt: '' };
      page.evaluate.mockResolvedValue([fakeTweet]);
      browser.launch.mockResolvedValue({ context: {}, page });

      const result = await service.searchTweets('test');
      expect(result).toEqual([fakeTweet]);
    });

    it('waits for tweet extraction before releasing the browser context', async () => {
      const { service, browser, page, context } = createService();
      const fakeTweet = { url: 'https://x.com/u/status/1', text: 'test', handle: 'u', displayName: 'U', likeCount: '1', retweetCount: '0', replyCount: '0', postedAt: '' };
      let resolveEvaluate: (value: unknown) => void = () => undefined;
      page.evaluate.mockReturnValue(new Promise((resolve) => { resolveEvaluate = resolve; }));
      browser.launch.mockResolvedValue({ context, page });

      const result = service.searchTweets('test');
      await Promise.resolve();

      expect(browser.release).not.toHaveBeenCalled();
      resolveEvaluate([fakeTweet]);
      await expect(result).resolves.toEqual([fakeTweet]);
      expect(browser.release).toHaveBeenCalledWith(context);
    });
  });

  describe('unlikeTweet', () => {
    it('returns ok:true when already unliked (likeButton count > 0)', async () => {
      const { service, browser } = createService();
      const loc: any = { count: jest.fn().mockResolvedValue(1), first: jest.fn().mockReturnThis(), waitFor: jest.fn().mockResolvedValue(null), click: jest.fn().mockResolvedValue(null) };
      const p: any = { goto: jest.fn().mockResolvedValue(null), waitForSelector: jest.fn().mockResolvedValue(null), locator: jest.fn().mockReturnValue(loc) };
      browser.launch.mockResolvedValue({ context: {}, page: p });

      const result = await service.unlikeTweet('https://x.com/u/status/1', 'acc-1');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('getXTrending', () => {
    it('navigates to trending URL', async () => {
      const { service, browser, page } = createService();
      page.evaluate.mockResolvedValue([{ rank: 1, topic: '#AI', tweetCount: '50K' }]);
      browser.launch.mockResolvedValue({ context: {}, page });

      const result = await service.getXTrending('acc-1');

      expect(page.goto).toHaveBeenCalledWith(
        'https://x.com/explore/tabs/trending',
        expect.any(Object),
      );
      expect(result).toEqual([{ rank: 1, topic: '#AI', tweetCount: '50K' }]);
    });
  });

  describe('getUserTweets', () => {
    it('delegates profile timeline reads to the browser service', async () => {
      const { service, browser } = createService();

      await service.getUserTweets('testuser', 5, 'acc-1');

      expect(browser.readProfileTweets).toHaveBeenCalledWith('testuser', 5, 'acc-1');
    });

    it('returns browser service profile tweet results', async () => {
      const { service, browser } = createService();
      const tweets = [{ url: 'https://x.com/u/status/1', text: 'hello', handle: 'u', displayName: 'U', likeCount: '0', retweetCount: '0', replyCount: '0', postedAt: '' }];
      browser.readProfileTweets.mockResolvedValue(tweets);

      const result = await service.getUserTweets('testuser', 5, 'acc-1');

      expect(result).toEqual(tweets);
    });
  });
});
