import { afterEach, describe, expect, it } from 'vitest';
import { apiUrl } from './api';

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
