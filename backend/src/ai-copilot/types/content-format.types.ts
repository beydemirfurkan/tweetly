import type { StyleProfile } from './style-profile.types';

export type TweetFormat = 'micro' | 'punch' | 'spark' | 'hook' | 'storm' | 'thunder';

export const TWEET_FORMATS: Record<TweetFormat, { label: string; maxLength: number; description: string }> = {
  micro: { label: 'Micro', maxLength: 45, description: 'Tek cümle, sert hook' },
  punch: { label: 'Punch', maxLength: 120, description: 'Kanca + mesaj' },
  spark: { label: 'Spark', maxLength: 200, description: 'Hook + insight' },
  hook: { label: 'Hook', maxLength: 280, description: 'Klasik tek tweet' },
  storm: { label: 'Storm', maxLength: 280 * 5, description: 'Mini thread (3-5 tweet)' },
  thunder: { label: 'Thunder', maxLength: 1500, description: 'Uzun form hikaye' },
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
