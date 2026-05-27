import { XBrowserService } from './x-browser.service';
import type { BrowserConfigService } from './browser-config';

function makeConfig(releaseTimeoutMs: number): BrowserConfigService {
  return {
    cfg: {
      headless: true,
      rootDir: '/tmp/data',
      defaultUserDataDir: '/tmp/user-data',
      launchTimeoutMs: 45_000,
      releaseTimeoutMs,
    },
    resolveProfileDir: (id?: string) => (id ? `/tmp/data/user-data/${id}` : '/tmp/user-data'),
  } as unknown as BrowserConfigService;
}

describe('XBrowserService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not hang when browser context close never resolves', async () => {
    jest.useFakeTimers();
    const config = makeConfig(25);
    const cookies = { inject: jest.fn() } as any;
    const service = new XBrowserService(config, cookies);
    const context = {
      close: jest.fn(() => new Promise<void>(() => undefined)),
    };

    const release = service.release(context as any);
    jest.advanceTimersByTime(25);

    await expect(release).resolves.toBeUndefined();
    expect(context.close).toHaveBeenCalledTimes(1);
  });
});
