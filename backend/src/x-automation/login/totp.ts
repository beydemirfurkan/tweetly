import { createHmac } from 'node:crypto';

/**
 * RFC 6238 TOTP (HMAC-SHA1, 30s step, 6 digits) — the de-facto Authenticator
 * App default that X uses. Self-contained to avoid pinning a 3rd-party OTP lib
 * across breaking versions.
 */
export function generateTotp(base32Secret: string, atMs: number = Date.now()): string {
  const key = decodeBase32(base32Secret);
  const counter = Math.floor(atMs / 1000 / 30);

  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (code % 1_000_000).toString().padStart(6, '0');
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function decodeBase32(input: string): Buffer {
  const cleaned = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z2-7]+$/.test(cleaned)) {
    throw new Error('TOTP secret is not valid base32');
  }
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('TOTP secret contains invalid base32 char');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}
