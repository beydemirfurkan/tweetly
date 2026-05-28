import { SimilarityScorer } from '../similarity-scorer.service';

const s = new SimilarityScorer();

describe('SimilarityScorer.hash', () => {
  it('produces a 16-char hex string', () => {
    const h = s.hash('hello world');
    expect(h).toMatch(/^[a-f0-9]{16}$/);
  });

  it('is deterministic', () => {
    expect(s.hash('same')).toBe(s.hash('same'));
  });

  it('differs across distinct inputs', () => {
    expect(s.hash('alpha')).not.toBe(s.hash('beta'));
  });
});

describe('SimilarityScorer.jaccard', () => {
  it('returns 0 for empty sets on either side', () => {
    expect(s.jaccard(new Set(), new Set(['a']))).toBe(0);
    expect(s.jaccard(new Set(['a']), new Set())).toBe(0);
  });

  it('returns 1 for identical sets', () => {
    expect(s.jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    expect(s.jaccard(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(0);
  });

  it('computes |A∩B| / |A∪B| for overlapping sets', () => {
    // {a,b,c} ∩ {b,c,d} = {b,c} (size 2); union size 4 → 0.5
    expect(s.jaccard(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBeCloseTo(0.5);
  });
});
