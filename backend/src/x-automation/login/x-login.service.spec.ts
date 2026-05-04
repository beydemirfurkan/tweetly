import * as path from 'path';

import { classifyOnboardingError, resolveLoginProfileDir } from './x-login.service';

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
