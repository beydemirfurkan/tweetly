import { CookieHealthCheckService, type CookieHealthInput } from './cookie-health-check.service';

/**
 * Helper that fakes the global `fetch` for a single call. Restored
 * automatically after each test by jest.restoreAllMocks() (see top-level
 * afterEach below).
 */
function mockFetchOnce(response: Partial<Response> | Error): void {
  const fetchMock = jest.spyOn(global, 'fetch');
  if (response instanceof Error) {
    fetchMock.mockRejectedValueOnce(response);
  } else {
    fetchMock.mockResolvedValueOnce(response as Response);
  }
}

function makeResponse(opts: {
  status: number;
  jsonBody?: unknown;
  jsonThrows?: Error;
}): Partial<Response> {
  return {
    status: opts.status,
    ok: opts.status >= 200 && opts.status < 300,
    json: opts.jsonThrows
      ? jest.fn().mockRejectedValueOnce(opts.jsonThrows)
      : jest.fn().mockResolvedValueOnce(opts.jsonBody),
  };
}

const VALID_INPUT: CookieHealthInput = {
  authToken: 'tok',
  ct0: 'csrf',
  twid: 'u%3D12345',
};

describe('CookieHealthCheckService', () => {
  let svc: CookieHealthCheckService;

  beforeEach(() => {
    // Disable the 401/403 retry in tests so each assertion still
    // corresponds to a single fetch call (the retry behaviour itself
    // gets its own dedicated test below).
    process.env.COOKIE_HEALTH_AUTH_RETRY = '0';
    svc = new CookieHealthCheckService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.COOKIE_HEALTH_AUTH_RETRY;
    delete process.env.COOKIE_HEALTH_AUTH_RETRY_DELAY_MS;
  });

  it('rejects when authToken or ct0 is missing without hitting the network', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(svc.check({ authToken: '', ct0: 'csrf' })).resolves.toEqual(
      expect.objectContaining({ ok: false, reason: 'missing_fields' }),
    );
    await expect(svc.check({ authToken: 'tok', ct0: '' })).resolves.toEqual(
      expect.objectContaining({ ok: false, reason: 'missing_fields' }),
    );
    await expect(svc.check({ authToken: '  ', ct0: 'csrf' })).resolves.toEqual(
      expect.objectContaining({ ok: false, reason: 'missing_fields' }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('classifies fetch rejection as network_error and truncates the detail', async () => {
    const longErrMsg = 'x'.repeat(300);
    mockFetchOnce(new Error(longErrMsg));

    const result = await svc.check(VALID_INPUT);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('network_error');
    // 200-char cap + ellipsis suffix
    expect(result.detail!.length).toBeLessThanOrEqual(201);
    expect(result.detail).toMatch(/…$/);
  });

  it('classifies AbortError (timeout) as network_error', async () => {
    const err = Object.assign(new Error('signal timed out'), { name: 'AbortError' });
    mockFetchOnce(err);

    const result = await svc.check(VALID_INPUT);
    expect(result).toEqual(
      expect.objectContaining({ ok: false, reason: 'network_error' }),
    );
  });

  it.each([401, 403])('classifies HTTP %d as rejected_by_x with the status preserved', async (status) => {
    mockFetchOnce(makeResponse({ status }));

    const result = await svc.check(VALID_INPUT);
    expect(result).toEqual({
      ok: false,
      reason: 'rejected_by_x',
      detail: expect.stringContaining(`HTTP ${status}`),
      status,
    });
  });

  it.each([500, 502, 503])('classifies HTTP %d as rejected_by_x with the status preserved', async (status) => {
    mockFetchOnce(makeResponse({ status }));

    const result = await svc.check(VALID_INPUT);
    expect(result).toEqual({
      ok: false,
      reason: 'rejected_by_x',
      detail: expect.stringContaining(`HTTP ${status}`),
      status,
    });
  });

  it('classifies a 200 with broken JSON as invalid_response', async () => {
    mockFetchOnce(makeResponse({ status: 200, jsonThrows: new Error('Unexpected token in JSON') }));

    const result = await svc.check(VALID_INPUT);
    expect(result).toEqual(
      expect.objectContaining({ ok: false, reason: 'invalid_response' }),
    );
    expect(result.detail).toContain('Unexpected token');
  });

  it('classifies a 200 missing screen_name as invalid_response', async () => {
    mockFetchOnce(makeResponse({ status: 200, jsonBody: { other_field: 'x' } }));

    const result = await svc.check(VALID_INPUT);
    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        reason: 'invalid_response',
        detail: 'response missing screen_name',
        status: 200,
      }),
    );
  });

  it('classifies a 200 with non-string screen_name as invalid_response', async () => {
    mockFetchOnce(makeResponse({ status: 200, jsonBody: { screen_name: 12345 } }));

    const result = await svc.check(VALID_INPUT);
    expect(result).toEqual(
      expect.objectContaining({ ok: false, reason: 'invalid_response' }),
    );
  });

  it('returns ok with the screen_name on a successful response', async () => {
    mockFetchOnce(makeResponse({ status: 200, jsonBody: { screen_name: 'alice' } }));

    const result = await svc.check(VALID_INPUT);
    expect(result).toEqual({ ok: true, screenName: 'alice', status: 200 });
  });

  it('retries a transient 401 once before declaring rejected_by_x', async () => {
    process.env.COOKIE_HEALTH_AUTH_RETRY = '1';
    process.env.COOKIE_HEALTH_AUTH_RETRY_DELAY_MS = '0';
    const spy = jest.spyOn(global, 'fetch');
    spy.mockResolvedValueOnce(makeResponse({ status: 401 }) as Response);
    spy.mockResolvedValueOnce(
      makeResponse({ status: 200, jsonBody: { screen_name: 'alice' } }) as Response,
    );

    const result = await svc.check(VALID_INPUT);
    expect(result).toEqual({ ok: true, screenName: 'alice', status: 200 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries and returns rejected_by_x when 401/403 persists', async () => {
    process.env.COOKIE_HEALTH_AUTH_RETRY = '1';
    process.env.COOKIE_HEALTH_AUTH_RETRY_DELAY_MS = '0';
    const spy = jest.spyOn(global, 'fetch');
    spy.mockResolvedValueOnce(makeResponse({ status: 403 }) as Response);
    spy.mockResolvedValueOnce(makeResponse({ status: 403 }) as Response);

    const result = await svc.check(VALID_INPUT);
    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        reason: 'rejected_by_x',
        status: 403,
        detail: expect.stringContaining('after retries'),
      }),
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('sends the cookie + csrf headers built from the input', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    fetchSpy.mockResolvedValueOnce(
      makeResponse({ status: 200, jsonBody: { screen_name: 'alice' } }) as Response,
    );

    await svc.check(VALID_INPUT);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.cookie).toBe('auth_token=tok; ct0=csrf; twid=u%3D12345');
    expect(headers['x-csrf-token']).toBe('csrf');
    expect(headers.authorization).toMatch(/^Bearer /);
  });

  it('omits the twid cookie segment when twid is null/blank', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    fetchSpy.mockResolvedValueOnce(
      makeResponse({ status: 200, jsonBody: { screen_name: 'alice' } }) as Response,
    );

    await svc.check({ authToken: 'tok', ct0: 'csrf', twid: null });

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.cookie).toBe('auth_token=tok; ct0=csrf');
  });
});
