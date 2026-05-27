import * as path from 'path';

import { buildCancelCheck, classifyOnboardingError, resolveLoginProfileDir } from '../x-login.service';
import { LoginFlowError } from '../login-error';

describe('classifyOnboardingError', () => {
  it('maps X onboarding temporary rejection to login_cooldown', () => {
    expect(classifyOnboardingError('{"message":"Could not log you in now. Try again later."}')).toEqual({
      reason: 'login_cooldown',
      detail: 'X onboarding rejected login temporarily; try again later',
    });
  });

  it('maps onboarding credential rejection to invalid_credentials', () => {
    expect(classifyOnboardingError('{"message":"Could not authenticate you"}')).toEqual({
      reason: 'invalid_credentials',
      detail: 'X onboarding rejected credentials',
    });
  });

  it('ignores unrelated onboarding errors', () => {
    expect(classifyOnboardingError('{"message":"rate limit"}')).toBeNull();
  });
});

describe('resolveLoginProfileDir', () => {
  it('uses a proxy-specific staging profile for connect jobs', () => {
    expect(path.basename(resolveLoginProfileDir(null, 'Alice', 'US'))).toBe('login-alice-us');
  });

  it('ignores proxy country for reauth jobs so the account profile stays stable', () => {
    expect(path.basename(resolveLoginProfileDir('alice', 'Alice', 'US'))).toBe('alice');
  });

  it('sanitizes unsafe profile characters', () => {
    expect(path.basename(resolveLoginProfileDir(null, 'ali/ce', null))).toBe('login-ali_ce');
  });
});

describe('buildCancelCheck', () => {
  it('is a no-op closure when neither isCancelled nor signal is provided', async () => {
    const check = buildCancelCheck({ username: 'a', password: 'b' });
    await expect(check()).resolves.toBeUndefined();
  });

  it('throws LoginFlowError(cancelled, shutdown signal) when the AbortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const check = buildCancelCheck({ username: 'a', password: 'b', signal: controller.signal });

    await expect(check()).rejects.toBeInstanceOf(LoginFlowError);
    await expect(check()).rejects.toMatchObject({ reason: 'cancelled', detail: expect.stringMatching(/shutdown/i) });
  });

  it('throws LoginFlowError(cancelled, by user) when isCancelled resolves true', async () => {
    const check = buildCancelCheck({
      username: 'a',
      password: 'b',
      isCancelled: async () => true,
    });

    await expect(check()).rejects.toMatchObject({ reason: 'cancelled', detail: expect.stringMatching(/user/i) });
  });

  it('returns without throwing when isCancelled resolves false', async () => {
    const check = buildCancelCheck({
      username: 'a',
      password: 'b',
      isCancelled: async () => false,
    });
    await expect(check()).resolves.toBeUndefined();
  });

  it('signal takes precedence over isCancelled — no DB roundtrip on shutdown', async () => {
    const controller = new AbortController();
    controller.abort();
    const isCancelled = jest.fn(async () => false);
    const check = buildCancelCheck({
      username: 'a',
      password: 'b',
      signal: controller.signal,
      isCancelled,
    });

    await expect(check()).rejects.toMatchObject({ reason: 'cancelled' });
    expect(isCancelled).not.toHaveBeenCalled();
  });

  it('calls isCancelled lazily — once per check invocation', async () => {
    const isCancelled = jest.fn(async () => false);
    const check = buildCancelCheck({ username: 'a', password: 'b', isCancelled });

    await check();
    await check();
    await check();

    expect(isCancelled).toHaveBeenCalledTimes(3);
  });
});
