import type { Request } from 'express';
import { TieredThrottlerGuard } from './tiered-throttler.guard';
import type { AuthedRequest } from './api-key.guard';

describe('TieredThrottlerGuard.getTracker', () => {
  function createGuard(): TieredThrottlerGuard {
    // Instantiate with minimal deps — only getTracker is tested directly.
    return Object.create(TieredThrottlerGuard.prototype) as TieredThrottlerGuard;
  }

  it('returns user-scoped tracker when userId is present', async () => {
    const guard = createGuard();
    const req = { tweetlyAuth: { userId: 'user-42' } } as unknown as Request;
    const tracker = await guard['getTracker'](req);
    expect(tracker).toBe('user:user-42');
  });

  it('falls back to req.ip for unauthenticated requests', async () => {
    const guard = createGuard();
    const req = { ip: '203.0.113.50', headers: {} } as unknown as Request;
    const tracker = await guard['getTracker'](req);
    expect(tracker).toBe('ip:203.0.113.50');
  });

  it('uses anon when req.ip is undefined', async () => {
    const guard = createGuard();
    const req = { headers: {} } as unknown as Request;
    const tracker = await guard['getTracker'](req);
    expect(tracker).toBe('ip:anon');
  });

  it('ignores X-Forwarded-For header (uses req.ip instead)', async () => {
    const guard = createGuard();
    const req = {
      ip: '203.0.113.50',
      headers: { 'x-forwarded-for': '1.2.3.4' },
    } as unknown as Request;
    const tracker = await guard['getTracker'](req);
    // Should NOT use the spoofed 1.2.3.4 from X-Forwarded-For
    expect(tracker).toBe('ip:203.0.113.50');
    expect(tracker).not.toContain('1.2.3.4');
  });
});
