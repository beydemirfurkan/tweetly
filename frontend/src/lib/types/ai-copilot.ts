/**
 * Shared AI Copilot domain types.
 *
 * These shapes mirror what `/api/v1/copilot/*` returns. They live here (not
 * inside a page) because more than one component now consumes them — tab
 * sub-components, hooks that wrap the fetch, and tests that need to stub
 * the responses.
 */

export type TweetFormat = 'micro' | 'punch' | 'spark' | 'hook' | 'storm' | 'thunder';

export interface StyleProfile {
  tone: string[];
  avgLength: number;
  hashtagUsage: number;
  emojiUsage: number;
  topTopics: string[];
  contentStyle: string;
  postingPattern: string;
  engagementStyle: string;
  summary: string;
}

export interface ProfileAnalysis {
  handle: string;
  displayName: string;
  bio: string;
  followersCount: number;
  followingCount: number;
  tweetsAnalyzed: number;
  styleProfile: StyleProfile;
  analyzedAt: string;
}

export interface ContentSuggestion {
  id: string;
  text: string;
  format: TweetFormat;
  charCount: number;
  estimatedScore: number;
  reasoning: string;
}

export interface ViralScore {
  score: number;
  maxScore: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  estimatedReach: string;
  formatFit: number;
  hookStrength: number;
  readabilityScore: number;
}

export interface HistoryItem {
  id: string;
  type: 'profile' | 'content' | 'viral_score';
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown>;
  createdAt: string;
}
