import { XDirectService } from './x-direct.service';
import { mockXBrowserService } from '@/test/mocks/x-browser.mock';

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
  // These specs assert the real Patchright flow (browser.launch, navigation,
  // selectors). The global test setup forces X_EXECUTOR_MODE='noop' which would
  // dry-run write paths and skip browser.launch, so we override per-suite.
  const previousMode = process.env.X_EXECUTOR_MODE;
  beforeAll(() => {
    process.env.X_EXECUTOR_MODE = 'patchright';
  });
  afterAll(() => {
    if (previousMode === undefined) delete process.env.X_EXECUTOR_MODE;
    else process.env.X_EXECUTOR_MODE = previousMode;
  });

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

  describe('getUser', () => {
    it('passes the requested handle into page.evaluate for fallback parsing', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });
      page.evaluate.mockImplementation(async (fn: (params: unknown) => unknown, params: unknown) => {
        const nameEl = {
          querySelector: jest.fn().mockReturnValue({ textContent: 'Furkan' }),
          querySelectorAll: jest.fn().mockReturnValue([]),
        };
        return withFakeSelectors({ [SEL.userName]: nameEl }, () => fn(params));
      });

      const result = await service.getUser('test-account', 'acc-1');

      expect(result).toEqual(expect.objectContaining({ handle: 'test-account', displayName: 'Furkan' }));
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

  describe('searchUsers', () => {
    it('extracts handles from profile links instead of relying on span order', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });
      page.evaluate.mockImplementation(async (fn: (params: { limit: number }) => unknown, params: { limit: number }) => {
        return withFakeDocument([fakeUserCell({ handle: 'test-account', displayName: 'Furkan', bio: 'builder' })], () => fn(params));
      });

      const result = await service.searchUsers('test-account', 3, 'acc-1');

      expect(result).toEqual([
        expect.objectContaining({ handle: 'test-account', displayName: 'Furkan', bio: 'builder', profileUrl: 'https://x.com/test-account' }),
      ]);
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

    it('filters trend metadata and separators from topics', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });
      page.evaluate.mockImplementation(async (fn: (params: { trend: string }) => unknown, params: { trend: string }) => {
        return withFakeDocument([fakeTrend(['Türkiye tarihinde gündemde', '·', 'Ayın 1 indirimi', '12 B gönderi'])], () => fn(params));
      });

      const result = await service.getXTrending('acc-1');

      expect(result).toEqual([{ rank: 1, topic: 'Ayın 1 indirimi', tweetCount: '12 B gönderi' }]);
    });
  });

  describe('getUserFollowers', () => {
    it('extracts follower handles from profile links', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });
      page.evaluate.mockImplementation(async (fn: (params: { limit: number }) => unknown, params: { limit: number }) => {
        return withFakeDocument([fakeUserCell({ handle: 'follower', displayName: 'Follower', bio: 'bio' })], () => fn(params));
      });

      const result = await service.getUserFollowers('test-account', 5, 'acc-1');

      expect(result).toEqual([{ handle: 'follower', displayName: 'Follower', bio: 'bio', verified: false }]);
    });
  });

  describe('getUserFollowing', () => {
    it('navigates to /following URL and extracts user cells', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });
      page.evaluate.mockImplementation(async (fn: (params: { limit: number }) => unknown, params: { limit: number }) => {
        return withFakeDocument([fakeUserCell({ handle: 'followee', displayName: 'Followee', bio: 'bio' })], () => fn(params));
      });

      const result = await service.getUserFollowing('test-account', 5, 'acc-1');

      expect(page.goto).toHaveBeenCalledWith(
        'https://x.com/test-account/following',
        expect.any(Object),
      );
      expect(result).toEqual([{ handle: 'followee', displayName: 'Followee', bio: 'bio', verified: false }]);
    });

    it('honors verifiedOnly filter', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });
      page.evaluate.mockResolvedValue([
        { handle: 'a', displayName: 'A', bio: '', verified: true },
        { handle: 'b', displayName: 'B', bio: '', verified: false },
      ]);

      const result = await service.getUserFollowing('test-account', 5, 'acc-1', { verifiedOnly: true });

      expect(result).toEqual([{ handle: 'a', displayName: 'A', bio: '', verified: true }]);
    });
  });

  describe('getTweetRetweeters', () => {
    it('navigates to /retweets URL and extracts user cells', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });
      page.evaluate.mockImplementation(async (fn: (params: { limit: number }) => unknown, params: { limit: number }) => {
        return withFakeDocument([fakeUserCell({ handle: 'rter', displayName: 'RTer', bio: '' })], () => fn(params));
      });

      const result = await service.getTweetRetweeters('https://x.com/u/status/1', 5, 'acc-1');

      expect(page.goto).toHaveBeenCalledWith(
        'https://x.com/u/status/1/retweets',
        expect.any(Object),
      );
      expect(result).toEqual([{ handle: 'rter', displayName: 'RTer', bio: '', verified: false }]);
    });

    it('strips trailing slash before appending /retweets', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });
      page.evaluate.mockResolvedValue([]);

      await service.getTweetRetweeters('https://x.com/u/status/1/', 5, 'acc-1');

      expect(page.goto).toHaveBeenCalledWith(
        'https://x.com/u/status/1/retweets',
        expect.any(Object),
      );
    });
  });

  describe('getTweetQuotes', () => {
    it('navigates to /quotes URL and returns extracted tweets', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });
      const fakeTweet = { url: 'https://x.com/q/status/2', text: 'quoting', handle: 'q', displayName: 'Q', likeCount: '0', retweetCount: '0', replyCount: '0', postedAt: '' };
      page.evaluate.mockResolvedValue([fakeTweet]);

      const result = await service.getTweetQuotes('https://x.com/u/status/1', 10, 'acc-1');

      expect(page.goto).toHaveBeenCalledWith(
        'https://x.com/u/status/1/quotes',
        expect.any(Object),
      );
      expect(result).toEqual([fakeTweet]);
    });

    it('returns [] when no tweet articles render (empty quotes page)', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });
      page.waitForSelector.mockRejectedValue(new Error('timeout'));

      const result = await service.getTweetQuotes('https://x.com/u/status/1', 10, 'acc-1');

      expect(result).toEqual([]);
    });
  });

  describe('getTweetReplies', () => {
    it('filters out the parent tweet from the extracted list', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });
      const parent = { url: 'https://x.com/u/status/1', text: 'parent', handle: 'u', displayName: 'U', likeCount: '0', retweetCount: '0', replyCount: '0', postedAt: '' };
      const reply = { url: 'https://x.com/r/status/2', text: 'reply', handle: 'r', displayName: 'R', likeCount: '0', retweetCount: '0', replyCount: '0', postedAt: '' };
      page.evaluate.mockResolvedValue([parent, reply]);

      const result = await service.getTweetReplies('https://x.com/u/status/1', 10, 'acc-1');

      expect(result).toEqual([reply]);
    });

    it('returns [] when the tweet page does not render (deleted/protected)', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });
      page.waitForSelector.mockRejectedValue(new Error('timeout'));

      const result = await service.getTweetReplies('https://x.com/u/status/1', 10, 'acc-1');

      expect(result).toEqual([]);
    });

    it('honors limit by clipping after parent removal', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });
      const parent = { url: 'https://x.com/u/status/1', text: 'p', handle: 'u', displayName: 'U', likeCount: '0', retweetCount: '0', replyCount: '0', postedAt: '' };
      const r1 = { url: 'https://x.com/a/status/2', text: '1', handle: 'a', displayName: 'A', likeCount: '0', retweetCount: '0', replyCount: '0', postedAt: '' };
      const r2 = { url: 'https://x.com/b/status/3', text: '2', handle: 'b', displayName: 'B', likeCount: '0', retweetCount: '0', replyCount: '0', postedAt: '' };
      page.evaluate.mockResolvedValue([parent, r1, r2]);

      const result = await service.getTweetReplies('https://x.com/u/status/1', 1, 'acc-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(r1);
    });
  });

  describe('getUserMentions', () => {
    it('delegates to searchTweets with @handle query', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });
      page.evaluate.mockResolvedValue([]);

      await service.getUserMentions('test-account', 5, 'acc-1');

      expect(page.goto).toHaveBeenCalledWith(
        expect.stringContaining('q=%40test-account'),
        expect.any(Object),
      );
    });

    it('strips a leading @ from the handle before querying', async () => {
      const { service, browser, page } = createService();
      browser.launch.mockResolvedValue({ context: {}, page });
      page.evaluate.mockResolvedValue([]);

      await service.getUserMentions('@test-account', 5, 'acc-1');

      // After stripping leading @ the query becomes "@test-account" again,
      // which encodes to %40test-account — never %40%40.
      expect(page.goto).toHaveBeenCalledWith(
        expect.stringContaining('q=%40test-account'),
        expect.any(Object),
      );
      expect(page.goto).not.toHaveBeenCalledWith(
        expect.stringContaining('%40%40'),
        expect.any(Object),
      );
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

  describe('NoOp dry-run mode (X_EXECUTOR_MODE != patchright)', () => {
    let savedMode: string | undefined;
    beforeAll(() => {
      savedMode = process.env.X_EXECUTOR_MODE;
      process.env.X_EXECUTOR_MODE = 'noop';
    });
    afterAll(() => {
      if (savedMode === undefined) delete process.env.X_EXECUTOR_MODE;
      else process.env.X_EXECUTOR_MODE = savedMode;
    });

    it('unlikeTweet returns dryRun without launching browser', async () => {
      const { service, browser } = createService();
      const result = await service.unlikeTweet('https://x.com/u/status/1', 'acc-1');
      expect(result).toEqual({ ok: true, dryRun: true });
      expect(browser.launch).not.toHaveBeenCalled();
    });

    it('unretweetTweet returns dryRun without launching browser', async () => {
      const { service, browser } = createService();
      const result = await service.unretweetTweet('https://x.com/u/status/1', 'acc-1');
      expect(result).toEqual({ ok: true, dryRun: true });
      expect(browser.launch).not.toHaveBeenCalled();
    });

    it('unfollowAccount returns dryRun without launching browser', async () => {
      const { service, browser } = createService();
      const result = await service.unfollowAccount('elonmusk', 'acc-1');
      expect(result).toEqual({ ok: true, dryRun: true });
      expect(browser.launch).not.toHaveBeenCalled();
    });

    it('deleteTweet returns dryRun without launching browser', async () => {
      const { service, browser } = createService();
      const result = await service.deleteTweet('https://x.com/u/status/1', 'acc-1');
      expect(result).toEqual({ ok: true, dryRun: true });
      expect(browser.launch).not.toHaveBeenCalled();
    });

    it('sendDm returns dryRun without launching browser', async () => {
      const { service, browser } = createService();
      const result = await service.sendDm('elonmusk', 'hi', 'acc-1');
      expect(result).toEqual({ ok: true, dryRun: true });
      expect(browser.launch).not.toHaveBeenCalled();
    });

    it('updateProfile returns dryRun with the requested fields without launching browser', async () => {
      const { service, browser } = createService();
      const result = await service.updateProfile({ name: 'New', bio: 'Hi' }, 'acc-1');
      expect(result).toEqual({ ok: true, dryRun: true, updated: ['name', 'bio'] });
      expect(browser.launch).not.toHaveBeenCalled();
    });

    it('updateAvatar returns dryRun without launching browser or touching the filesystem', async () => {
      const { service, browser } = createService();
      // Path is intentionally bogus — noop mode must short-circuit before any
      // fs.existsSync check.
      const result = await service.updateAvatar('/tmp/does-not-exist.jpg', 'acc-1');
      expect(result).toEqual({ ok: true, dryRun: true });
      expect(browser.launch).not.toHaveBeenCalled();
    });

    it('updateBanner returns dryRun without launching browser or touching the filesystem', async () => {
      const { service, browser } = createService();
      const result = await service.updateBanner('/tmp/does-not-exist.jpg', 'acc-1');
      expect(result).toEqual({ ok: true, dryRun: true });
      expect(browser.launch).not.toHaveBeenCalled();
    });
  });

  describe('updateAvatar / updateBanner file validation (patchright mode)', () => {
    it('updateAvatar throws when file does not exist', async () => {
      const { service, browser } = createService();
      await expect(service.updateAvatar('/tmp/definitely-missing.jpg', 'acc-1')).rejects.toThrow(/avatar file not found/);
      expect(browser.launch).not.toHaveBeenCalled();
    });

    it('updateBanner throws when file does not exist', async () => {
      const { service, browser } = createService();
      await expect(service.updateBanner('/tmp/definitely-missing.jpg', 'acc-1')).rejects.toThrow(/banner file not found/);
      expect(browser.launch).not.toHaveBeenCalled();
    });
  });
});

function withFakeDocument<T>(elements: unknown[], run: () => T): T {
  const originalDocument = (global as any).document;
  const originalLocation = (global as any).location;
  (global as any).document = { querySelectorAll: jest.fn().mockReturnValue(elements) };
  (global as any).location = { origin: 'https://x.com' };
  try {
    return run();
  } finally {
    (global as any).document = originalDocument;
    (global as any).location = originalLocation;
  }
}

function withFakeSelectors<T>(selectors: Record<string, unknown>, run: () => T): T {
  const originalDocument = (global as any).document;
  (global as any).document = {
    querySelector: jest.fn((selector: string) => selectors[selector] ?? null),
    querySelectorAll: jest.fn(() => []),
  };
  try {
    return run();
  } finally {
    (global as any).document = originalDocument;
  }
}

function fakeUserCell(input: { handle: string; displayName: string; bio: string }) {
  const nameEl = {
    querySelectorAll: jest.fn().mockReturnValue([
      { textContent: input.displayName },
      { textContent: `@${input.handle}` },
    ]),
  };
  return {
    querySelector: jest.fn((selector: string) => {
      if (selector === '[data-testid="UserName"]') return nameEl;
      if (selector === '[data-testid="UserDescription"]') return { textContent: input.bio };
      return null;
    }),
    querySelectorAll: jest.fn((selector: string) => {
      if (selector.includes('a[href')) return [{ href: `https://x.com/${input.handle}` }];
      return [];
    }),
  };
}

function fakeTrend(texts: string[]) {
  return {
    querySelectorAll: jest.fn().mockReturnValue(texts.map((textContent) => ({ textContent }))),
  };
}
