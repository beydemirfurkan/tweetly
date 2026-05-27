import { isStrongSourceCandidate, scoreSourceCandidate } from '../source-quality-scoring';
import type { TrendingRepo } from '@domain/types/content.types';

function candidate(overrides: Partial<TrendingRepo> = {}): TrendingRepo {
  return {
    owner: 'hacker-news',
    name: 'open-source coding agent workflow for typescript projects',
    slug: 'hacker-news/open-source-coding-agent-workflow',
    url: 'https://example.com/agent-workflow',
    description: 'a developer tool for ai coding agents, workflows and prompt automation',
    language: 'example.com',
    starsToday: 180,
    totalStars: 180,
    sourceType: 'discussion',
    sourceId: 'hacker_news',
    sourceName: 'Hacker News',
    publishedAt: '2026-04-29T08:00:00.000Z',
    discussionCount: 60,
    ...overrides,
  };
}

describe('scoreSourceCandidate', () => {
  const now = new Date('2026-04-29T12:00:00.000Z');

  it('accepts strong account-fit technical sources', () => {
    const score = scoreSourceCandidate(candidate(), {}, now);

    expect(score.total).toBeGreaterThanOrEqual(70);
    expect(isStrongSourceCandidate(score, 70)).toBe(true);
  });

  it('penalizes weak off-brand topics', () => {
    const strong = scoreSourceCandidate(candidate(), {}, now).total;
    const weak = scoreSourceCandidate(
      candidate({
        name: 'celebrity crypto funding story launches today',
        description: 'funding announcement with no developer value',
        starsToday: 5,
        discussionCount: 0,
      }),
      {},
      now,
    ).total;

    expect(weak).toBeLessThan(strong);
    expect(weak).toBeLessThan(70);
  });

  it('does not accept open-source as sufficient account fit by itself', () => {
    const score = scoreSourceCandidate(
      candidate({
        name: 'an open-source stethoscope that costs between two and five dollars',
        description: 'open-source hardware for medical access',
        starsToday: 180,
        discussionCount: 60,
      }),
      {},
      now,
    );

    expect(score.total).toBeLessThan(75);
    expect(isStrongSourceCandidate(score, 75)).toBe(false);
  });

  it('reduces freshness score for stale articles', () => {
    const fresh = scoreSourceCandidate(candidate(), {}, now).breakdown.freshness;
    const stale = scoreSourceCandidate(candidate({ publishedAt: '2026-04-20T12:00:00.000Z' }), {}, now).breakdown.freshness;

    expect(stale).toBeLessThan(fresh);
  });
});
