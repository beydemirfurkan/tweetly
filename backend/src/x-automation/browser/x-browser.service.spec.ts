import { XBrowserService } from './x-browser.service';

describe('XBrowserService', () => {
  const originalReleaseTimeout = process.env.PATCHRIGHT_RELEASE_TIMEOUT_MS;

  afterEach(() => {
    jest.useRealTimers();
    if (originalReleaseTimeout === undefined) {
      delete process.env.PATCHRIGHT_RELEASE_TIMEOUT_MS;
    } else {
      process.env.PATCHRIGHT_RELEASE_TIMEOUT_MS = originalReleaseTimeout;
    }
  });

  it('does not hang when browser context close never resolves', async () => {
    jest.useFakeTimers();
    process.env.PATCHRIGHT_RELEASE_TIMEOUT_MS = '25';
    const service = new XBrowserService({} as any);
    const context = {
      close: jest.fn(() => new Promise<void>(() => undefined)),
    };

    const release = service.release(context as any);
    jest.advanceTimersByTime(25);

    await expect(release).resolves.toBeUndefined();
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('waits for profile tweet extraction before releasing the browser context', async () => {
    const service = new XBrowserService({ findById: jest.fn().mockResolvedValue(null) } as any);
    const context = { close: jest.fn().mockResolvedValue(null) };
    const page = {
      goto: jest.fn().mockResolvedValue(null),
      waitForTimeout: jest.fn().mockResolvedValue(null),
      evaluate: jest.fn(),
    };
    let resolveEvaluate: (value: unknown) => void = () => undefined;
    page.evaluate.mockReturnValue(new Promise((resolve) => { resolveEvaluate = resolve; }));
    jest.spyOn(service, 'launch').mockResolvedValue({ context, page } as any);
    const release = jest.spyOn(service, 'release').mockResolvedValue(undefined);

    const result = service.readProfileTweets('testuser', 3, 'acc-1');
    await Promise.resolve();

    expect(release).not.toHaveBeenCalled();
    resolveEvaluate([{ url: 'https://x.com/testuser/status/1' }]);
    await expect(result).resolves.toEqual([{ url: 'https://x.com/testuser/status/1' }]);
    expect(release).toHaveBeenCalledWith(context);
  });
});
