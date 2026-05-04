import { afterEach, describe, expect, it } from 'vitest';
import { apiUrl, failureReasonMessage, type LoginJobFailureReason } from './api';

const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

afterEach(() => {
  if (originalApiUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  }
});

describe('apiUrl', () => {
  it('uses configured API origin and normalizes slashes', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://tw-backend.example.com/';

    expect(apiUrl('health')).toBe('https://tw-backend.example.com/health');
    expect(apiUrl('/health')).toBe('https://tw-backend.example.com/health');
  });

  it('returns a relative URL when no API origin is configured server-side', () => {
    delete process.env.NEXT_PUBLIC_API_URL;

    expect(apiUrl('/health')).toBe('/health');
  });
});

describe('failureReasonMessage', () => {
  it('does not suggest manual cookie or token fallback for login failures', () => {
    const reasons: LoginJobFailureReason[] = [
      'invalid_credentials',
      'captcha_required',
      'email_challenge',
      'email_verification_required',
      'suspicious_login_blocked',
      'login_cooldown',
      'cookies_missing',
      'home_not_reached',
      'account_locked',
      'phone_verification_required',
      'unknown',
    ];

    for (const locale of ['tr', 'en']) {
      for (const reason of reasons) {
        const message = failureReasonMessage(reason, locale).toLowerCase();

        expect(message).not.toContain('cookie yapıştır');
        expect(message).not.toContain('paste cookies');
        expect(message).not.toContain('token yapıştır');
        expect(message).not.toContain('paste tokens');
      }
    }
  });
});
