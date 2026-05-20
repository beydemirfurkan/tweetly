import { createHmac } from 'crypto';
import { WebhookDeliveryService, SIGNATURE_HEADER } from './webhook-delivery.service';

// Mock the SSRF guard so tests can use non-routable test URLs
jest.mock('./webhook-url.guard', () => ({
  assertPublicWebhookUrl: jest.fn().mockResolvedValue(undefined),
  WebhookUrlError: class WebhookUrlError extends Error {},
}));

function createService() {
  return new WebhookDeliveryService();
}

const TEST_URL = 'https://hook.test/callback';
const TEST_PAYLOAD = { event: 'tweet.new', monitor_id: 'mon-1' };
const TEST_SECRET = 'a'.repeat(64);

describe('WebhookDeliveryService', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns ok:true for HTTP 200', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' }) as any;
    const result = await createService().deliver(TEST_URL, TEST_PAYLOAD, null);
    expect(result).toEqual({ ok: true });
  });

  it('returns ok:false for HTTP 500', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' }) as any;
    const result = await createService().deliver(TEST_URL, TEST_PAYLOAD, null);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });

  it('returns ok:false when fetch throws network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;
    const result = await createService().deliver(TEST_URL, TEST_PAYLOAD, null);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('returns ok:false with timeout message on AbortError', async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortErr) as any;
    const result = await createService().deliver(TEST_URL, TEST_PAYLOAD, null);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Timeout');
  });

  it('sends X-Tweetly-Event and User-Agent headers', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' }) as any;
    await createService().deliver(TEST_URL, TEST_PAYLOAD, null);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers['X-Tweetly-Event']).toBe('tweet.new');
    expect(options.headers['User-Agent']).toBe('xtweetly-mcp-webhook/1.0');
  });

  it('omits the signature header when secret is null', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' }) as any;
    await createService().deliver(TEST_URL, TEST_PAYLOAD, null);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers[SIGNATURE_HEADER]).toBeUndefined();
  });

  it('signs the body with the monitor secret when provided', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' }) as any;
    await createService().deliver(TEST_URL, TEST_PAYLOAD, TEST_SECRET);

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const header = options.headers[SIGNATURE_HEADER] as string;
    expect(header).toBeDefined();

    const match = header.match(/^t=(\d+),v1=([a-f0-9]{64})$/);
    expect(match).not.toBeNull();

    const [, ts, sig] = match!;
    const expected = createHmac('sha256', TEST_SECRET)
      .update(`${ts}.${options.body}`)
      .digest('hex');
    expect(sig).toBe(expected);
  });
});
