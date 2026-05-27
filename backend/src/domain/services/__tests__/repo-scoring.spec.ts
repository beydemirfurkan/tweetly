import { scoreRepo, isQualityRepo } from './repo-scoring';
import type { TrendingRepo } from '@domain/types/content.types';

const DEFAULT_WEIGHTS: Record<string, number> = {
  relevanceHigh: 20, relevanceTool: 10,
  popularityHigh: 25, popularityMid: 15, popularityLow: 5,
  trustHighStars: 15, trustMidStars: 10, trustVerifiedOwner: 5,
  clarityGood: 10, clarityNoDesc: -20, clarityGeneric: -10,
  freshnessHigh: 10, freshnessMid: 5,
  noveltyTopicRepeat: -10, noveltyOwnerRepeat: -5,
};

function repo(overrides: Partial<TrendingRepo> = {}): TrendingRepo {
  return {
    owner: 'example',
    name: 'tool',
    slug: 'example/tool',
    url: 'https://github.com/example/tool',
    description: 'an AI coding tool for developers',
    language: 'TypeScript',
    starsToday: 120,
    totalStars: 5000,
    ...overrides,
  };
}

describe('scoreRepo', () => {
  it('returns non-negative total', () => {
    const { total } = scoreRepo(repo(), DEFAULT_WEIGHTS);
    expect(total).toBeGreaterThan(0);
  });

  it('popular repo scores higher than obscure', () => {
    const popular = scoreRepo(repo({ starsToday: 150 }), DEFAULT_WEIGHTS).total;
    const obscure = scoreRepo(repo({ starsToday: 5 }), DEFAULT_WEIGHTS).total;
    expect(popular).toBeGreaterThan(obscure);
  });

  it('no description gives negative clarity', () => {
    const { breakdown } = scoreRepo(repo({ description: '' }), DEFAULT_WEIGHTS);
    expect(breakdown.clarity).toBeLessThan(0);
  });

  it('trusted owner adds trust score', () => {
    const trusted = scoreRepo(repo({ owner: 'openai', totalStars: 2000 }), DEFAULT_WEIGHTS);
    const unknown = scoreRepo(repo({ owner: 'unknown-person', totalStars: 2000 }), DEFAULT_WEIGHTS);
    expect(trusted.total).toBeGreaterThan(unknown.total);
  });

  it('owner repeat penalty applied', () => {
    const normal = scoreRepo(repo(), DEFAULT_WEIGHTS, {}, 0).total;
    const penalised = scoreRepo(repo(), DEFAULT_WEIGHTS, {}, 3).total;
    expect(penalised).toBeLessThan(normal);
  });
});

describe('isQualityRepo', () => {
  it('accepts repo above threshold', () => {
    const score = scoreRepo(repo(), DEFAULT_WEIGHTS);
    expect(isQualityRepo(score, 10)).toBe(true);
  });

  it('rejects repo below threshold', () => {
    const score = scoreRepo(repo({ description: '', starsToday: 1, totalStars: 0 }), DEFAULT_WEIGHTS);
    expect(isQualityRepo(score, 100)).toBe(false);
  });
});
