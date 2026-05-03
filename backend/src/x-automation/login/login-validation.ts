import { decodeBase32 } from './totp';
import { LoginValidationError } from '@common/exceptions';

export function normalizeUsername(raw: unknown): string {
  if (typeof raw !== 'string') throw new LoginValidationError('username is required');
  const trimmed = raw.trim().replace(/^@+/, '');
  if (!/^[A-Za-z0-9_]{1,50}$/.test(trimmed)) {
    throw new LoginValidationError('username must be 1-50 chars of [A-Za-z0-9_]');
  }
  return trimmed;
}

export function normalizeProxyCountry(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') throw new LoginValidationError('proxyCountry must be a string');
  const t = raw.trim();
  if (!t) return null;
  const upper = t.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) {
    throw new LoginValidationError('proxyCountry must be a 2-letter country code');
  }
  return upper;
}

export function requireString(raw: unknown, field: string): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new LoginValidationError(`${field} is required`);
  }
  return raw;
}

export function assertBase32Secret(raw: string, field: string): void {
  try {
    decodeBase32(raw);
  } catch {
    throw new LoginValidationError(`${field} must be a valid base32 string (TOTP secret)`);
  }
}
