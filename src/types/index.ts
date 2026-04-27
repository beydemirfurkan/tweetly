export interface TrendingRepo {
  owner: string;
  name: string;
  slug: string;
  url: string;
  description: string;
  language: string;
  starsToday: number;
  totalStars: number;
}

export type QueueStatus = 'pending' | 'sent' | 'failed' | 'dead';

export interface QueueItem {
  id: string;
  status: QueueStatus;
  attempts: number;
  createdAt: string;
  scheduledAt: string;
  repo: string;
  url: string;
  text: string;
  sentAt?: string;
  lastError?: string;
  lastTriedAt?: string;
}

export interface PostedItem {
  repo: string;
  postedAt: string;
}

export interface QueueState {
  items: QueueItem[];
}

export interface PostedState {
  items: PostedItem[];
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'OK';

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  ok: (...args: unknown[]) => void;
}
