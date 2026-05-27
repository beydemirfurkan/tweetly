import {
  cookieCipherTransformer,
  decryptCookieValue,
  encryptCookieValue,
  resetCookieCipherForTests,
} from '../cookie-cipher.transformer';

describe('cookieCipherTransformer', () => {
  beforeEach(() => {
    resetCookieCipherForTests();
  });

  it('round-trips a non-empty plaintext via to + from', () => {
    const stored = cookieCipherTransformer.to('auth_token_value');
    expect(typeof stored).toBe('string');
    expect((stored as string).startsWith('v1:')).toBe(true);
    expect(cookieCipherTransformer.from(stored)).toBe('auth_token_value');
  });

  it('passes through null and empty string unchanged', () => {
    expect(cookieCipherTransformer.to(null)).toBeNull();
    expect(cookieCipherTransformer.to(undefined)).toBeNull();
    expect(cookieCipherTransformer.to('')).toBe('');
    expect(cookieCipherTransformer.from(null)).toBeNull();
    expect(cookieCipherTransformer.from(undefined)).toBeNull();
    expect(cookieCipherTransformer.from('')).toBe('');
  });

  it('does not double-encrypt a value already in v1: envelope', () => {
    const once = cookieCipherTransformer.to('payload');
    const twice = cookieCipherTransformer.to(once as string);
    expect(twice).toBe(once);
  });

  it('reads legacy plaintext rows untouched (backward compatibility)', () => {
    // Rows written before this change have no v1: prefix.
    expect(cookieCipherTransformer.from('legacy_plain_cookie')).toBe('legacy_plain_cookie');
  });

  it('rejects tampered ciphertext on decrypt', () => {
    const stored = cookieCipherTransformer.to('original') as string;
    const [ver, body] = stored.split(':');
    const buf = Buffer.from(body, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = `${ver}:${buf.toString('base64')}`;
    expect(() => cookieCipherTransformer.from(tampered)).toThrow();
  });

  it('produces a fresh ciphertext for each call (random IV)', () => {
    const a = cookieCipherTransformer.to('same') as string;
    const b = cookieCipherTransformer.to('same') as string;
    expect(a).not.toEqual(b);
    expect(cookieCipherTransformer.from(a)).toBe('same');
    expect(cookieCipherTransformer.from(b)).toBe('same');
  });
});

describe('encryptCookieValue / decryptCookieValue', () => {
  beforeEach(() => resetCookieCipherForTests());

  it('round-trips via direct helpers', () => {
    const encrypted = encryptCookieValue('hello');
    expect(encrypted).not.toBeNull();
    expect(encrypted!.startsWith('v1:')).toBe(true);
    expect(decryptCookieValue(encrypted)).toBe('hello');
  });

  it('handles null and empty', () => {
    expect(encryptCookieValue(null)).toBeNull();
    expect(encryptCookieValue('')).toBe('');
    expect(decryptCookieValue(null)).toBeNull();
    expect(decryptCookieValue('')).toBe('');
  });
});
