import { checkWebhookUrl, isPrivateIp, normalizeIpLiteral } from '../webhook-url-validator';

jest.mock('node:dns', () => {
  const lookup = jest.fn();
  return { promises: { lookup } };
});

const mockedLookup = jest.requireMock('node:dns').promises.lookup as jest.Mock;

function lookupReturns(addresses: string[]): void {
  mockedLookup.mockResolvedValue(addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));
}

describe('normalizeIpLiteral', () => {
  it('returns canonical IPv4 unchanged', () => {
    expect(normalizeIpLiteral('127.0.0.1')).toBe('127.0.0.1');
  });

  it('lowercases canonical IPv6', () => {
    expect(normalizeIpLiteral('::1')).toBe('::1');
    expect(normalizeIpLiteral('FE80::1')).toBe('fe80::1');
  });

  it('decodes 32-bit decimal integer to IPv4', () => {
    expect(normalizeIpLiteral('2130706433')).toBe('127.0.0.1');
  });

  it('decodes 0x-prefixed hex to IPv4', () => {
    expect(normalizeIpLiteral('0x7f000001')).toBe('127.0.0.1');
  });

  it('decodes per-octet octal forms', () => {
    expect(normalizeIpLiteral('0177.0.0.1')).toBe('127.0.0.1');
  });

  it('decodes IPv4-mapped IPv6', () => {
    expect(normalizeIpLiteral('::ffff:127.0.0.1')).toBe('127.0.0.1');
  });

  it('returns null for ordinary hostnames', () => {
    expect(normalizeIpLiteral('example.com')).toBeNull();
    expect(normalizeIpLiteral('hooks.tenant.dev')).toBeNull();
  });
});

describe('isPrivateIp', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.5',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.1',
    '224.0.0.1',
    '255.255.255.255',
  ])('flags IPv4 %s as private', (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each([
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd12:3456:7890::1',
    'ff02::1',
    '::ffff:127.0.0.1',
  ])('flags IPv6 %s as private', (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each(['1.1.1.1', '8.8.8.8', '203.0.113.10', '2606:4700:4700::1111'])(
    'allows public IP %s',
    (ip) => expect(isPrivateIp(ip)).toBe(false),
  );

  it('treats unparseable values as unsafe', () => {
    expect(isPrivateIp('not-an-ip')).toBe(true);
  });
});

describe('checkWebhookUrl', () => {
  // Override the test-wide WEBHOOK_HOST_ALLOWLIST so these specs exercise
  // the real SSRF rules instead of the convenience allowlist used by other
  // monitor specs.
  const originalAllowlist = process.env.WEBHOOK_HOST_ALLOWLIST;
  beforeEach(() => {
    mockedLookup.mockReset();
    process.env.WEBHOOK_HOST_ALLOWLIST = '';
  });
  afterAll(() => {
    if (originalAllowlist === undefined) delete process.env.WEBHOOK_HOST_ALLOWLIST;
    else process.env.WEBHOOK_HOST_ALLOWLIST = originalAllowlist;
  });

  it('rejects an invalid URL', async () => {
    const r = await checkWebhookUrl('not a url');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_url');
  });

  it('rejects unsupported schemes (ftp, file)', async () => {
    const r = await checkWebhookUrl('ftp://example.com/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unsupported_scheme');
  });

  it('rejects http:// in production unless allowHttp', async () => {
    const r = await checkWebhookUrl('http://example.com/hook', { nodeEnv: 'production' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('http_not_allowed_in_production');
  });

  it('allows http:// loopback in production when allowHttp=true', async () => {
    lookupReturns(['127.0.0.1']);
    // Loopback IP literal short-circuits before DNS lookup
    const r = await checkWebhookUrl('http://127.0.0.1:9000/hook', {
      nodeEnv: 'production',
      allowHttp: true,
    });
    // private_ip_literal still rejects loopback (the SSRF rule wins over allowHttp);
    // allowHttp only switches the http vs https decision off.
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('private_ip_literal');
  });

  it('rejects loopback IP literal in canonical form', async () => {
    const r = await checkWebhookUrl('https://127.0.0.1:8443/hook');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('private_ip_literal');
  });

  it('rejects AWS metadata IP (169.254.169.254)', async () => {
    const r = await checkWebhookUrl('http://169.254.169.254/latest/meta-data/', { allowHttp: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('private_ip_literal');
  });

  it('rejects obfuscated hex IP that decodes to loopback', async () => {
    const r = await checkWebhookUrl('http://0x7f000001/hook', { allowHttp: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('private_ip_literal');
  });

  it('rejects IPv6 loopback literal', async () => {
    const r = await checkWebhookUrl('http://[::1]/hook', { allowHttp: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('private_ip_literal');
  });

  it('rejects RFC1918 IPv4-mapped IPv6', async () => {
    const r = await checkWebhookUrl('http://[::ffff:10.0.0.1]/hook', { allowHttp: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('private_ip_literal');
  });

  it('rejects a hostname that resolves to a private IP', async () => {
    lookupReturns(['10.0.0.7']);
    const r = await checkWebhookUrl('https://internal.tenant.dev/hook');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('private_ip_resolved');
  });

  it('rejects a hostname that resolves to any single private IP among several', async () => {
    lookupReturns(['1.2.3.4', '169.254.169.254']);
    const r = await checkWebhookUrl('https://mixed.example/hook');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('private_ip_resolved');
  });

  it('allows a hostname that resolves to a public IP', async () => {
    lookupReturns(['203.0.113.10']);
    const r = await checkWebhookUrl('https://hooks.tenant.dev/path');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resolvedIps).toEqual(['203.0.113.10']);
  });

  it('rejects DNS failures', async () => {
    mockedLookup.mockRejectedValue(new Error('ENOTFOUND'));
    const r = await checkWebhookUrl('https://does-not-exist.example/hook');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('dns_lookup_failed');
  });

  it('host blocklist short-circuits a public-resolving hostname', async () => {
    lookupReturns(['203.0.113.10']);
    const r = await checkWebhookUrl('https://blocked.example/hook', { hostBlocklist: 'blocked.example' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('host_blocklisted');
  });

  it('host allowlist bypasses both literal + DNS checks', async () => {
    // Note: the allowlist intentionally lets ops route to internal gateways.
    const r = await checkWebhookUrl('http://internal.gateway/hook', {
      hostAllowlist: 'internal.gateway',
      allowHttp: true,
    });
    expect(r.ok).toBe(true);
    expect(mockedLookup).not.toHaveBeenCalled();
  });
});
