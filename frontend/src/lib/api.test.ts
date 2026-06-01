import { afterEach, describe, expect, it } from 'vitest';
import { apiUrl } from './api';
import trMessages from '../../messages/tr.json';
import enMessages from '../../messages/en.json';

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
    process.env.NEXT_PUBLIC_API_URL = 'https://api.xtweetly.com/';

    expect(apiUrl('health')).toBe('https://api.xtweetly.com/health');
    expect(apiUrl('/health')).toBe('https://api.xtweetly.com/health');
  });

  it('returns a relative URL when no API origin is configured server-side', () => {
    delete process.env.NEXT_PUBLIC_API_URL;

    expect(apiUrl('/health')).toBe('/health');
  });
});

const FAILURE_REASONS = [
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
] as const;

describe('failureReason i18n messages', () => {
  it('does not suggest manual cookie or token fallback (TR)', () => {
    for (const reason of FAILURE_REASONS) {
      const message = (trMessages.connectDialog as Record<string, unknown>)
        .failureReasons
        ? (trMessages.connectDialog.failureReasons as Record<string, string>)[reason].toLowerCase()
        : '';

      expect(message).not.toContain('cookie yapıştır');
      expect(message).not.toContain('token yapıştır');
    }
  });

  it('does not suggest manual cookie or token fallback (EN)', () => {
    for (const reason of FAILURE_REASONS) {
      const message = (enMessages.connectDialog as Record<string, unknown>)
        .failureReasons
        ? (enMessages.connectDialog.failureReasons as Record<string, string>)[reason].toLowerCase()
        : '';

      expect(message).not.toContain('paste cookies');
      expect(message).not.toContain('paste tokens');
    }
  });

  it('has a message for every failure reason in both locales', () => {
    const trReasons = trMessages.connectDialog.failureReasons as Record<string, string>;
    const enReasons = enMessages.connectDialog.failureReasons as Record<string, string>;

    for (const reason of FAILURE_REASONS) {
      expect(trReasons[reason]).toBeTruthy();
      expect(enReasons[reason]).toBeTruthy();
    }
  });
});
