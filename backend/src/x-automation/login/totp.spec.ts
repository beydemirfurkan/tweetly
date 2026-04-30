import { decodeBase32, generateTotp } from './totp';

describe('decodeBase32', () => {
  it('handles whitespace, lowercase, padding', () => {
    const a = decodeBase32('JBSWY3DPEHPK3PXP');
    const b = decodeBase32('jbswy 3dp ehpk 3pxp==');
    expect(b).toEqual(a);
  });

  it('rejects non-base32 input', () => {
    expect(() => decodeBase32('not-valid-1!')).toThrow();
  });
});

describe('generateTotp', () => {
  // RFC 6238 Appendix B test vectors are HMAC-SHA1 over secret "12345678901234567890",
  // 8 digits. Authenticator-app convention is 6 digits, so our impl truncates.
  // Below: re-derive the 6-digit slice from the published 8-digit values.
  // T=59         → 8-digit 94287082 → 6-digit 287082
  // T=1111111109 → 8-digit 07081804 → 6-digit 081804
  // T=1234567890 → 8-digit 89005924 → 6-digit 005924
  const SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // ascii "12345678901234567890"

  it.each([
    [59 * 1000, '287082'],
    [1111111109 * 1000, '081804'],
    [1234567890 * 1000, '005924'],
  ])('generates RFC 6238 vector at t=%d', (atMs, expected) => {
    expect(generateTotp(SECRET_BASE32, atMs)).toBe(expected);
  });

  it('is stable within the same 30s window', () => {
    const t = 1700000000000;
    expect(generateTotp(SECRET_BASE32, t)).toBe(generateTotp(SECRET_BASE32, t + 5_000));
  });

  it('rolls over to a different code at the next 30s boundary', () => {
    const t = 1700000000000;
    const a = generateTotp(SECRET_BASE32, t);
    const b = generateTotp(SECRET_BASE32, t + 30_000);
    expect(a).not.toBe(b);
  });
});
