import type { TrendingRepo, Topic } from '../types/content.types';

export interface RepoScore {
  repo: string;
  total: number;
  breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  relevance: number;
  popularity: number;
  trust: number;
  clarity: number;
  freshness: number;
  novelty: number;
  penalty: number;
}

const TRUSTED_OWNERS = new Set([
  'google', 'meta', 'openai', 'microsoft', 'anthropic', 'vercel', 'netlify',
  'cloudflare', 'aws', 'amazon-web-services', 'github', 'gitlab', 'stripe',
  'shopify', 'supabase', 'firebase', 'tensorflow', 'pytorch', 'huggingface',
  'langchain', 'ollama', 'cursor', 'windsurf', 'anthropics',
]);

const HIGH_RELEVANCE = /\b(agent|ai|llm|coding|developer|workflow|copilot|prompt|gpt|claude|gemini|model|neural|ml|machine.?learning|deep.?learning|nlp|transformer)\b/i;
const TOOL_RELEVANCE = /\b(library|framework|tool|cli|sdk|api|platform|engine|runtime|compiler|debugger|linter|formatter)\b/i;
const GENERIC_DESC = /^(a |an |the )?(simple |basic |lightweight )?(library|tool|framework|package|module|wrapper|client|sdk) (for|to|that)/i;

export function scoreRepo(
  repo: TrendingRepo,
  weights: Record<string, number>,
  recentTopicCounts: Partial<Record<Topic, number>> = {},
  recentOwnerCount = 0,
): RepoScore {
  const desc = repo.description ?? '';
  const descLower = desc.toLowerCase();
  const owner = repo.owner.toLowerCase();

  const relevance = calcRelevance(descLower, weights);
  const popularity = calcPopularity(repo.starsToday, weights);
  const trust = calcTrust(repo.totalStars, owner, weights);
  const clarity = calcClarity(desc, weights);
  const freshness = calcFreshness(repo.starsToday, repo.totalStars, weights);
  const novelty = calcNovelty(recentTopicCounts, recentOwnerCount, weights);

  const total = relevance + popularity + trust + clarity + freshness + novelty;

  return {
    repo: repo.slug,
    total: Math.max(0, total),
    breakdown: { relevance, popularity, trust, clarity, freshness, novelty, penalty: 0 },
  };
}

function calcRelevance(desc: string, w: Record<string, number>): number {
  let score = 0;
  if (HIGH_RELEVANCE.test(desc)) score += w.relevanceHigh ?? 20;
  if (TOOL_RELEVANCE.test(desc)) score += w.relevanceTool ?? 10;
  return score;
}

function calcPopularity(starsToday: number, w: Record<string, number>): number {
  if (starsToday > 100) return w.popularityHigh ?? 25;
  if (starsToday > 50) return w.popularityMid ?? 15;
  if (starsToday > 10) return w.popularityLow ?? 5;
  return 0;
}

function calcTrust(totalStars: number, owner: string, w: Record<string, number>): number {
  let score = 0;
  if (totalStars > 10000) score += w.trustHighStars ?? 15;
  else if (totalStars > 1000) score += w.trustMidStars ?? 10;
  if (TRUSTED_OWNERS.has(owner)) score += w.trustVerifiedOwner ?? 5;
  return score;
}

function calcClarity(desc: string, w: Record<string, number>): number {
  if (!desc || desc.trim().length === 0) return w.clarityNoDesc ?? -20;
  const len = desc.trim().length;
  if (len >= 10 && len <= 150) return w.clarityGood ?? 10;
  if (GENERIC_DESC.test(desc)) return w.clarityGeneric ?? -10;
  return 0;
}

function calcFreshness(starsToday: number, totalStars: number, w: Record<string, number>): number {
  if (starsToday === 0) return 0;
  const ratio = starsToday / Math.max(totalStars, 1);
  if (ratio > 0.05) return w.freshnessHigh ?? 10;
  if (ratio > 0.01) return w.freshnessMid ?? 5;
  return 0;
}

function calcNovelty(
  topicCounts: Partial<Record<Topic, number>>,
  ownerCount: number,
  w: Record<string, number>,
): number {
  let score = 0;
  const totalTopics = Object.values(topicCounts).reduce((s, c) => s + (c ?? 0), 0);
  if (totalTopics > 5) score += w.noveltyTopicRepeat ?? -10;
  if (ownerCount >= 3) score += w.noveltyOwnerRepeat ?? -5;
  return score;
}

export function isQualityRepo(score: RepoScore, minScore: number): boolean {
  return score.total >= minScore;
}
