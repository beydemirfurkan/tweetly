import { TextNormalizer } from '../text-normalizer.service';

const n = new TextNormalizer();

describe('TextNormalizer.normalize', () => {
  it('lower-cases and collapses whitespace', () => {
    expect(n.normalize('Hello   WORLD  ')).toBe('hello world');
  });

  it('strips http and https URLs', () => {
    expect(n.normalize('Check https://example.com/path and http://x.io now'))
      .toBe('check and now');
  });

  it('strips citation markers used in templates', () => {
    expect(n.normalize('repo: owner/x github: blah kaynak: yer')).toBe('owner x blah yer');
  });

  it('keeps Turkish lowercase letters in the keep-set', () => {
    // ğ, ü, ş, ö, ç, ı round-trip; capital İ does *not* (toLowerCase
    // inserts a combining dot above, which the regex strips). The contract
    // we lock down here is the lower-case keep-set.
    expect(n.normalize('şöyle güzel çığ')).toBe('şöyle güzel çığ');
  });
});

describe('TextNormalizer.signature', () => {
  it('returns at most SIGNATURE_TOKEN_COUNT tokens', () => {
    const long = Array.from({ length: 20 }, (_, i) => `token${i}`).join(' ');
    const sig = n.signature(long);
    expect(sig.split(' ')).toHaveLength(TextNormalizer.SIGNATURE_TOKEN_COUNT);
    expect(sig).toContain('token0');
    expect(sig).toContain('token13');
    expect(sig).not.toContain('token14');
  });

  it('produces the same signature for inputs that share the first SIGNATURE_TOKEN_COUNT tokens', () => {
    const head = Array.from({ length: TextNormalizer.SIGNATURE_TOKEN_COUNT }, (_, i) => `w${i}`).join(' ');
    expect(n.signature(`${head} apples`)).toBe(n.signature(`${head} oranges`));
  });
});

describe('TextNormalizer.tokenize', () => {
  it('drops tokens shorter than the min length', () => {
    const tokens = n.tokenize('hello to the kingdom');
    expect(tokens.has('hello')).toBe(true);
    expect(tokens.has('kingdom')).toBe(true);
    expect(tokens.has('to')).toBe(false);
    expect(tokens.has('the')).toBe(false);
  });

  it('deduplicates repeated tokens', () => {
    const tokens = n.tokenize('hello hello hello world');
    expect(tokens.size).toBe(2);
  });
});
