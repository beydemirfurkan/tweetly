import type { ValueTransformer } from 'typeorm';
import { CredentialCipherService, loadMasterKeyFromEnv } from './credential-cipher.service';

let singleton: CredentialCipherService | null = null;

export function getCookieCipher(): CredentialCipherService {
  if (!singleton) {
    singleton = new CredentialCipherService(loadMasterKeyFromEnv());
  }
  return singleton;
}

export function resetCookieCipherForTests(): void {
  singleton = null;
}

const CIPHER_PREFIX = 'v1:';

function isCiphertext(value: string): boolean {
  return value.startsWith(CIPHER_PREFIX);
}

export const cookieCipherTransformer: ValueTransformer = {
  to(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    if (value === '') return '';
    if (isCiphertext(value)) return value;
    return getCookieCipher().encrypt(value);
  },
  from(stored: string | null | undefined): string | null {
    if (stored === null || stored === undefined) return null;
    if (stored === '') return '';
    if (!isCiphertext(stored)) return stored;
    return getCookieCipher().decrypt(stored);
  },
};

export function encryptCookieValue(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  if (plaintext === '') return '';
  if (isCiphertext(plaintext)) return plaintext;
  return getCookieCipher().encrypt(plaintext);
}

export function decryptCookieValue(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined) return null;
  if (stored === '') return '';
  if (!isCiphertext(stored)) return stored;
  return getCookieCipher().decrypt(stored);
}
