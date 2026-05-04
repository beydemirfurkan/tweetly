export interface StyleProfile {
  tone: string[];
  avgLength: number;
  hashtagUsage: number;
  emojiUsage: number;
  topTopics: string[];
  contentStyle: ContentStyle;
  postingPattern: string;
  engagementStyle: string;
  summary: string;
}

export type ContentStyle =
  | 'short_punchy'
  | 'storytelling'
  | 'educational'
  | 'conversational'
  | 'analytical'
  | 'inspirational';

export interface ProfileAnalysisResult {
  handle: string;
  displayName: string;
  bio: string;
  followersCount: number;
  followingCount: number;
  tweetsAnalyzed: number;
  styleProfile: StyleProfile;
  analyzedAt: string;
}
