import { hasLoginProxy, resolveProxy } from './proxy-resolver';

describe('resolveProxy', () => {
  const ORIGINAL = process.env;
  afterEach(() => {
    process.env = ORIGINAL;
  });

  it('returns null when country is empty', () => {
    expect(resolveProxy(null)).toBeNull();
    expect(resolveProxy(undefined)).toBeNull();
    expect(resolveProxy('')).toBeNull();
  });

  it('returns null when country code malformed', () => {
    expect(resolveProxy('TUR')).toBeNull();
    expect(resolveProxy('1!')).toBeNull();
  });

  it('returns null when env var missing', () => {
    process.env = { ...ORIGINAL };
    delete process.env.LOGIN_PROXY_TR;
    expect(resolveProxy('TR')).toBeNull();
  });

  it('parses url with credentials', () => {
    process.env = { ...ORIGINAL, LOGIN_PROXY_TR: 'http://user:p%40ss@tr.proxy.example:8080' };
    expect(resolveProxy('tr')).toEqual({
      server: 'http://tr.proxy.example:8080',
      username: 'user',
      password: 'p@ss',
    });
  });

  it('parses url without credentials', () => {
    process.env = { ...ORIGINAL, LOGIN_PROXY_US: 'http://us.proxy.example:9000' };
    expect(resolveProxy('US')).toEqual({
      server: 'http://us.proxy.example:9000',
      username: undefined,
      password: undefined,
    });
  });

  it('omits port for default scheme port', () => {
    process.env = { ...ORIGINAL, LOGIN_PROXY_FR: 'https://fr.proxy.example:443' };
    expect(resolveProxy('FR')?.server).toBe('https://fr.proxy.example');
  });

  it('returns null on garbage env value', () => {
    process.env = { ...ORIGINAL, LOGIN_PROXY_DE: 'not-a-url' };
    expect(resolveProxy('DE')).toBeNull();
  });

  it('reports whether a country proxy env is configured', () => {
    process.env = { ...ORIGINAL, LOGIN_PROXY_US: 'http://us.proxy.example:9000' };
    expect(hasLoginProxy('us')).toBe(true);
    expect(hasLoginProxy('TR')).toBe(false);
    expect(hasLoginProxy('TUR')).toBe(false);
  });
});
