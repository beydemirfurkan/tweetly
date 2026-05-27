import { RetryPolicy } from '../retry-policy';

describe('RetryPolicy', () => {
  const policy = new RetryPolicy();

  it('does not retry permanent errors', () => {
    const d = policy.decide(1, 'permanent', 3);
    expect(d.shouldRetry).toBe(false);
  });

  it('does not retry when attempt >= maxAttempts', () => {
    const d = policy.decide(3, 'transient', 3);
    expect(d.shouldRetry).toBe(false);
  });

  it('retries auth errors with fixed delay', () => {
    const d = policy.decide(1, 'auth', 5);
    expect(d.shouldRetry).toBe(true);
    expect(d.delayMs).toBe(5 * 60 * 1000);
  });

  it('uses exponential backoff for rate_limit, capped at 30 min', () => {
    const d1 = policy.decide(1, 'rate_limit', 5);
    const d5 = policy.decide(5, 'rate_limit', 10);
    expect(d1.delayMs).toBeGreaterThanOrEqual(60_000);
    expect(d5.delayMs).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it('uses jittered exponential for transient, capped at 5 min', () => {
    const d = policy.decide(2, 'transient', 5);
    expect(d.shouldRetry).toBe(true);
    expect(d.delayMs).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it('classifies AUTH_REQUIRED messages as auth', () => {
    expect(policy.classify(new Error('AUTH_REQUIRED: session invalid'))).toBe('auth');
  });

  it('classifies 429 / rate-limit messages as rate_limit', () => {
    expect(policy.classify(new Error('Got 429 Too Many Requests'))).toBe('rate_limit');
    expect(policy.classify(new Error('rate-limit exceeded'))).toBe('rate_limit');
  });

  it('classifies validation failures as permanent', () => {
    expect(policy.classify(new Error('text exceeds character limit'))).toBe('permanent');
  });

  it('defaults unknown errors to transient', () => {
    expect(policy.classify(new Error('socket hang up'))).toBe('transient');
  });
});
