import type { SourceQualityBreakdown, Topic, TrendingRepo } from '../types/content.types';
import { inferTopic } from './topic-inference';

export interface SourceQualityScore {
  total: number;
  breakdown: SourceQualityBreakdown;
}

export interface SourceQualityWeights {
  sourceTrust: number;
  topicFit: number;
  freshness: number;
  discussion: number;
  accountFit: number;
  weakTitlePenalty: number;
}

const DEFAULT_WEIGHTS: SourceQualityWeights = {
  sourceTrust: 20,
  topicFit: 25,
  freshness: 20,
  discussion: 15,
  accountFit: 20,
  weakTitlePenalty: -15,
};

const TRUSTED_SOURCE_SCORE: Record<string, number> = {
  hacker_news: 20,
  dev_to: 14,
};

const STRONG_TOPICS = new Set<Topic>([
  'ai-agents',
  'ai-coding',
  'ai-models',
  'dev-tools',
  'dev-infra',
  'frontend',
  'backend',
  'data',
  'security',
  'open-source',
]);

const ACCOUNT_FIT = /\b(ai|agent|llm|coding|developer|devtool|framework|library|open.?source|github|typescript|javascript|react|vue|next\.?js|node|postgres|database|security|infra|cloud|cli|terminal|prompt|workflow|automation|model)\b/i;
const WEAK_TITLE = /\b(launches|announces|raises|funding|crypto|web3|politics|election|celebrity|sports)\b/i;

export function scoreSourceCandidate(
  candidate: TrendingRepo,
  weights: Partial<SourceQualityWeights> = {},
  now: Date = new Date(),
): SourceQualityScore {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const topic = inferTopic(candidate);
  const combined = `${candidate.name} ${candidate.description}`;

  const source = Math.min(w.sourceTrust, TRUSTED_SOURCE_SCORE[candidate.sourceId ?? ''] ?? Math.round(w.sourceTrust * 0.45));
  const topicScore = STRONG_TOPICS.has(topic) && topic !== 'other' ? w.topicFit : Math.round(w.topicFit * 0.25);
  const freshness = calcFreshness(candidate.publishedAt, w.freshness, now);
  const discussion = calcDiscussion(candidate.discussionCount ?? 0, candidate.starsToday, w.discussion);
  const accountFit = ACCOUNT_FIT.test(combined) ? w.accountFit : Math.round(w.accountFit * 0.3);
  const penalty = WEAK_TITLE.test(combined) ? w.weakTitlePenalty : 0;

  const total = Math.max(0, source + topicScore + freshness + discussion + accountFit + penalty);
  return {
    total,
    breakdown: { source, topic: topicScore, freshness, discussion, accountFit, penalty },
  };
}

export function isStrongSourceCandidate(score: SourceQualityScore, threshold = 70): boolean {
  return score.total >= threshold;
}

function calcFreshness(publishedAt: string | undefined, max: number, now: Date): number {
  if (!publishedAt) return Math.round(max * 0.4);
  const ts = Date.parse(publishedAt);
  if (!Number.isFinite(ts)) return Math.round(max * 0.4);
  const ageHours = Math.max(0, (now.getTime() - ts) / 3_600_000);
  if (ageHours <= 12) return max;
  if (ageHours <= 24) return Math.round(max * 0.8);
  if (ageHours <= 48) return Math.round(max * 0.55);
  if (ageHours <= 96) return Math.round(max * 0.3);
  return 0;
}

function calcDiscussion(comments: number, points: number, max: number): number {
  const discussionSignal = comments * 2 + points;
  if (discussionSignal >= 250) return max;
  if (discussionSignal >= 100) return Math.round(max * 0.75);
  if (discussionSignal >= 35) return Math.round(max * 0.5);
  if (discussionSignal >= 10) return Math.round(max * 0.25);
  return 0;
}
