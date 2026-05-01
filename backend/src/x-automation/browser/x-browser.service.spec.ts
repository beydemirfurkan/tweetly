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
});
