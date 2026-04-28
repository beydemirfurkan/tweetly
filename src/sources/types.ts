import type { Topic } from '../types';

export interface ContentSource {
  name: string;
  fetch(): Promise<SourcedItem[]>;
}

export interface SourcedItem {
  title: string;
  url: string;
  description: string;
  source: string;
  score?: number;
  topic?: Topic;
  publishedAt?: string;
  owner?: string;
  name?: string;
  language?: string;
  starsToday?: number;
  totalStars?: number;
}
