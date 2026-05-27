import { ProfileTweetReaderService } from './profile-tweet-reader.service';
import type { XBrowserService } from './x-browser.service';
import type { SelectorRegistry } from './selector-registry';

describe('ProfileTweetReaderService', () => {
  it('waits for profile tweet extraction before releasing the browser context', async () => {
    const context = { close: jest.fn().mockResolvedValue(null) };
    const page = {
      goto: jest.fn().mockResolvedValue(null),
      waitForTimeout: jest.fn().mockResolvedValue(null),
      evaluate: jest.fn(),
    };
    let resolveEvaluate: (value: unknown) => void = () => undefined;
    page.evaluate.mockReturnValue(new Promise((resolve) => { resolveEvaluate = resolve; }));

    const browser = {
      launch: jest.fn().mockResolvedValue({ context, page }),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as XBrowserService;
    const sel = { tweetArticle: 'article[data-testid="tweet"]' } as unknown as SelectorRegistry;
    const reader = new ProfileTweetReaderService(browser, sel);

    const result = reader.readProfileTweets('testuser', 3, 'acc-1');
    await Promise.resolve();

    expect(browser.release).not.toHaveBeenCalled();
    resolveEvaluate([{ url: 'https://x.com/testuser/status/1' }]);
    await expect(result).resolves.toEqual([{ url: 'https://x.com/testuser/status/1' }]);
    expect(browser.release).toHaveBeenCalledWith(context);
  });
});
