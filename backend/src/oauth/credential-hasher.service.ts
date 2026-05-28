import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';

/**
 * Hashes/verifies OAuth client secrets. SHA-256 → hex, constant-time
 * comparison. Keeping this as its own service means the OAuthService
 * doesn't reach into the `crypto` module via free functions and tests
 * can stub the hasher without monkey-patching Node's built-ins.
 */
@Injectable()
export class OAuthCredentialHasher {
  hash(plaintext: string): string {
    return crypto.createHash('sha256').update(plaintext).digest('hex');
  }

  /**
   * Constant-time comparison of a fresh-hashed plaintext against the stored
   * hash. Returns false if lengths differ — Buffer.byteLength mismatch is a
   * hard error from Node's timingSafeEqual, so we guard first.
   */
  verify(plaintext: string, storedHash: string): boolean {
    const computed = this.hash(plaintext);
    const a = Buffer.from(computed);
    const b = Buffer.from(storedHash);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
}
