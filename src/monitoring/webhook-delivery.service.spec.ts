import { WebhookDeliveryService } from './webhook-delivery.service';

function createService() {
  return new WebhookDeliveryService();
}

const TEST_URL = 'https://hook.test/callback';
const TEST_PAYLOAD = { event: 'tweet.new', monitor_id: 'mon-1' };

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

    const result = await createService().deliver(TEST_URL, TEST_PAYLOAD);

    expect(result).toEqual({ ok: true });
  });

  it('returns ok:false for HTTP 500', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' }) as any;

    const result = await createService().deliver(TEST_URL, TEST_PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });

  it('returns ok:false when fetch throws network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

    const result = await createService().deliver(TEST_URL, TEST_PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('returns ok:false with timeout message on AbortError', async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortErr) as any;

    const result = await createService().deliver(TEST_URL, TEST_PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Timeout');
  });

  it('sends X-Tweetly-Event header with event name', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' }) as any;

    await createService().deliver(TEST_URL, TEST_PAYLOAD);

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers['X-Tweetly-Event']).toBe('tweet.new');
  });

  it('sends User-Agent header', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' }) as any;

    await createService().deliver(TEST_URL, TEST_PAYLOAD);

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers['User-Agent']).toBe('tweetly-mcp-webhook/1.0');
  });
});
