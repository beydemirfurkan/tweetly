import { TieredThrottlerGuard } from '../tiered-throttler.guard';
import type { Request } from 'express';
import type { AuthedRequest } from '../api-key.guard';

// Subclass exposes the protected method for direct testing — same trick the
// @nestjs/throttler test suite uses.
class TestableThrottlerGuard extends TieredThrottlerGuard {
  public callGetTracker(req: Request): Promise<string> {
    return this.getTracker(req);
  }
}

function makeReq(overrides: Partial<Request> & { tweetlyAuth?: AuthedRequest['tweetlyAuth'] } = {}): Request {
  return {
    headers: {},
    ip: undefined,
    ...overrides,
  } as unknown as Request;
}

describe('TieredThrottlerGuard.getTracker', () => {
  let guard: TestableThrottlerGuard;
  beforeEach(() => {
    // Constructor args are filled by Nest; only the protected method matters here.
    guard = Object.create(TestableThrottlerGuard.prototype) as TestableThrottlerGuard;
  });

  it('uses the authenticated userId when present', async () => {
    const req = makeReq({ tweetlyAuth: { userId: 'user-1' } as AuthedRequest['tweetlyAuth'] });
    await expect(guard.callGetTracker(req)).resolves.toBe('user:user-1');
  });

  it('falls back to req.ip (set by Express trust-proxy) for unauthenticated requests', async () => {
    const req = makeReq({ ip: '203.0.113.10' });
    await expect(guard.callGetTracker(req)).resolves.toBe('ip:203.0.113.10');
  });

  it('ignores X-Forwarded-For when trust-proxy is off (req.ip falls back to socket peer)', async () => {
    // Real Express w/ trust proxy disabled returns the socket peer in req.ip,
    // independent of any X-Forwarded-For header — that is exactly what we test
    // by passing only req.ip below. A spoofed header MUST NOT influence the
    // tracker key.
    const req = makeReq({
      ip: '127.0.0.1',
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    await expect(guard.callGetTracker(req)).resolves.toBe('ip:127.0.0.1');
  });

  it('returns ip:anon when req.ip is missing entirely', async () => {
    const req = makeReq({ ip: undefined });
    await expect(guard.callGetTracker(req)).resolves.toBe('ip:anon');
  });
});
