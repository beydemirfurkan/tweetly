import { classifyOnboardingError, createOnboardingErrorLog } from './login-classifiers';

describe('classifyOnboardingError (cancelled / captcha branches re-added in #25)', () => {
  it('maps captcha mentions in the onboarding body to captcha_required', () => {
    expect(classifyOnboardingError('{"message":"Arkose challenge required"}')).toEqual({
      reason: 'captcha_required',
      detail: 'X requested captcha',
    });
    expect(classifyOnboardingError('{"errors":[{"message":"captcha needed"}]}')).toEqual({
      reason: 'captcha_required',
      detail: 'X requested captcha',
    });
  });
});

describe('createOnboardingErrorLog', () => {
  it('returns undefined from lastSince when nothing has been pushed', () => {
    const log = createOnboardingErrorLog();
    expect(log.lastSince(0)).toBeUndefined();
    expect(log.size()).toBe(0);
  });

  it('lastSince returns the most recent entry whose timestamp ≥ sinceMs', () => {
    const log = createOnboardingErrorLog();
    log.push('first');
    log.push('second');
    log.push('third');
    expect(log.lastSince(0)).toBe('third');
  });

  it('lastSince skips entries older than sinceMs — stale telemetry can no longer flip classification', async () => {
    const log = createOnboardingErrorLog();
    log.push('old telemetry 500');

    // Capture the step-start boundary AFTER the stale error landed.
    const stepStart = Date.now();

    // Wait a tick so the next push gets a strictly-later timestamp.
    await new Promise((resolve) => setTimeout(resolve, 5));
    log.push('real invalid_credentials');

    expect(log.lastSince(stepStart)).toBe('real invalid_credentials');
  });

  it('returns undefined when only stale entries exist relative to the window', async () => {
    const log = createOnboardingErrorLog();
    log.push('stale');
    await new Promise((resolve) => setTimeout(resolve, 5));
    // sinceMs is now in the future — no entry should match.
    expect(log.lastSince(Date.now() + 1_000)).toBeUndefined();
  });

  it('caps the internal buffer at 20 entries — older ones drop off (no unbounded growth)', () => {
    const log = createOnboardingErrorLog();
    for (let i = 0; i < 30; i++) log.push(`err-${i}`);
    expect(log.size()).toBe(20);
    // The oldest entries dropped — the most recent push wins lastSince().
    expect(log.lastSince(0)).toBe('err-29');
  });

  it('truncates each pushed body to 500 chars to keep memory bounded', () => {
    const log = createOnboardingErrorLog();
    log.push('x'.repeat(1_000));
    const last = log.lastSince(0)!;
    expect(last.length).toBeLessThanOrEqual(501); // 500 + ellipsis
    expect(last.endsWith('…')).toBe(true);
  });
});
