import { optionalBrowserChannel } from '../browser-channel';

describe('optionalBrowserChannel', () => {
  const original = process.env.PATCHRIGHT_BROWSER_CHANNEL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PATCHRIGHT_BROWSER_CHANNEL;
    } else {
      process.env.PATCHRIGHT_BROWSER_CHANNEL = original;
    }
  });

  it('uses Patchright bundled browser by default', () => {
    delete process.env.PATCHRIGHT_BROWSER_CHANNEL;

    expect(optionalBrowserChannel()).toEqual({});
  });

  it('allows an explicit browser channel override', () => {
    process.env.PATCHRIGHT_BROWSER_CHANNEL = 'chrome';

    expect(optionalBrowserChannel()).toEqual({ channel: 'chrome' });
  });
});
