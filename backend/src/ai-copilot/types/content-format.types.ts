import type { StyleProfile } from './style-profile.types';

export type TweetFormat = 'micro' | 'punch' | 'spark' | 'hook' | 'storm' | 'thunder';

export const TWEET_FORMATS: Record<TweetFormat, { label: string; maxLength: number; description: string }> = {
  micro: { label: 'Micro', maxLength: 45, description: 'One sentence, hard hook' },
  punch: { label: 'Punch', maxLength: 120, description: 'Hook + message' },
  spark: { label: 'Spark', maxLength: 200, description: 'Hook + insight' },
  hook: { label: 'Hook', maxLength: 280, description: 'Classic single tweet' },
  storm: { label: 'Storm', maxLength: 280 * 5, description: 'Mini thread (3-5 tweets)' },
  thunder: { label: 'Thunder', maxLength: 1500, description: 'Long-form story' },
};

export interface ContentSuggestion {
  id: string;
  text: string;
  format: TweetFormat;
  charCount: number;
  estimatedScore: number;
  reasoning: string;
}

export interface ContentSuggestRequest {
  format: TweetFormat;
  topic?: string;
  sourceHandles?: string[];
  styleProfile?: StyleProfile;
}

export interface ContentSuggestResult {
  suggestions: ContentSuggestion[];
  format: TweetFormat;
  generatedAt: string;
}
