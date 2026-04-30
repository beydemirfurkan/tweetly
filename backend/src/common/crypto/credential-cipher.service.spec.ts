import { CredentialCipherService, loadMasterKeyFromEnv } from './credential-cipher.service';

describe('CredentialCipherService', () => {
  const cipher = new CredentialCipherService();

  it('round-trips ASCII plaintext', () => {
    const blob = cipher.encrypt('hunter2!');
    expect(blob.startsWith('v1:')).toBe(true);
    expect(cipher.decrypt(blob)).toBe('hunter2!');
  });

  it('round-trips Unicode plaintext (TOTP secrets, accents)', () => {
    const plain = 'JBSWY3DPEHPK3PXP — şifre 🔐';
    expect(cipher.decrypt(cipher.encrypt(plain))).toBe(plain);
  });

  it('produces a fresh IV each call (ciphertexts differ for same plaintext)', () => {
    expect(cipher.encrypt('x')).not.toEqual(cipher.encrypt('x'));
  });

  it('rejects payload without version prefix', () => {
    expect(() => cipher.decrypt('abcdef')).toThrow(/version prefix/);
  });

  it('rejects unknown version', () => {
    expect(() => cipher.decrypt('v9:AAAA')).toThrow(/unsupported version/);
  });

  it('rejects truncated payload', () => {
    expect(() => cipher.decrypt('v1:AAAA')).toThrow(/payload too short/);
  });

  it('rejects tampered ciphertext (GCM auth tag fails)', () => {
    const blob = cipher.encrypt('secret');
    const [ver, body] = blob.split(':');
    const buf = Buffer.from(body, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = `${ver}:${buf.toString('base64')}`;
    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  it('rejects payload encrypted with different master key', () => {
    const otherKey = Buffer.alloc(32, 0xab);
    const other = new CredentialCipherService(otherKey);
    const blob = other.encrypt('cross-key');
    expect(() => cipher.decrypt(blob)).toThrow();
  });
});

describe('loadMasterKeyFromEnv', () => {
  it('decodes 64-char hex', () => {
    const hex = 'a'.repeat(64);
    expect(loadMasterKeyFromEnv({ ENCRYPTION_KEY: hex } as NodeJS.ProcessEnv).length).toBe(32);
  });

  it('decodes base64', () => {
    const b64 = Buffer.alloc(32, 7).toString('base64');
    expect(loadMasterKeyFromEnv({ ENCRYPTION_KEY: b64 } as NodeJS.ProcessEnv).length).toBe(32);
  });

  it('decodes base64url', () => {
    const b64url = Buffer.alloc(32, 7).toString('base64url');
    expect(loadMasterKeyFromEnv({ ENCRYPTION_KEY: b64url } as NodeJS.ProcessEnv).length).toBe(32);
  });

  it('throws when missing', () => {
    expect(() => loadMasterKeyFromEnv({} as NodeJS.ProcessEnv)).toThrow(/ENCRYPTION_KEY is required/);
  });

  it('throws when wrong length', () => {
    const short = Buffer.alloc(16, 1).toString('base64');
    expect(() => loadMasterKeyFromEnv({ ENCRYPTION_KEY: short } as NodeJS.ProcessEnv)).toThrow(
      /must decode to 32 bytes/,
    );
  });
});
