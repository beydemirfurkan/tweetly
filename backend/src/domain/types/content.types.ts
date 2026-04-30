export interface TrendingRepo {
  owner: string;
  name: string;
  slug: string;
  url: string;
  description: string;
  language: string;
  starsToday: number;
  totalStars: number;
  sourceType?: 'github' | 'article' | 'discussion';
  sourceId?: string;
  sourceName?: string;
  publishedAt?: string;
  discussionCount?: number;
  sourceScore?: number;
  sourceScoreBreakdown?: SourceQualityBreakdown;
}

export interface SourceQualityBreakdown {
  source: number;
  topic: number;
  freshness: number;
  discussion: number;
  accountFit: number;
  penalty: number;
}

export type ContentFormat =
  | 'repo_drop'
  | 'no_link_hook'
  | 'question'
  | 'comparison'
  | 'mini_thread'
  | 'bookmark_bait'
  | 'hot_take'
  | 'weekly_digest'
  | 'sponsor_native';

export type EngagementObjective =
  | 'reply'
  | 'bookmark'
  | 'profile_click'
  | 'retweet'
  | 'link_click'
  | 'dwell';

export type Topic =
  | 'ai-agents'
  | 'ai-coding'
  | 'ai-models'
  | 'dev-tools'
  | 'dev-infra'
  | 'frontend'
  | 'backend'
  | 'data'
  | 'security'
  | 'open-source'
  | 'other';

export interface FormatSlot {
  format: ContentFormat;
  objective: EngagementObjective;
  isThread: boolean;
  threadCount: number;
}
