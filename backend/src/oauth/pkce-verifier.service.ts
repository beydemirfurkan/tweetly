import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';

/**
 * PKCE S256 verifier (RFC 7636). Splitting this out of OAuthService gives
 * us a one-method seam for adding a `plain` verifier later (currently
 * S256-only by design), and lets clients of OAuthService stay agnostic
 * to the underlying hash algorithm.
 */
@Injectable()
export class PkceVerifier {
  /** Returns true iff `BASE64URL(SHA256(verifier)) === challenge`. */
  verifyS256(verifier: string, challenge: string): boolean {
    if (!verifier || !challenge) return false;
    const computed = crypto.createHash('sha256').update(verifier).digest('base64url');
    const a = Buffer.from(computed);
    const b = Buffer.from(challenge);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
}
