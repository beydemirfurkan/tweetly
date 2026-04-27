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

export interface ControlState {
  paused: boolean;
  reason?: string;
  pausedAt?: string;
  pauseUntil?: string;
  consecutiveFailures: number;
  lastFailureAt?: string;
  lastFailure?: string;
  lastSuccessAt?: string;
  updatedAt: string;
}

export interface ContentMemoryItem {
  repo: string;
  textHash: string;
  signature: string;
  text: string;
  createdAt: string;
}

export interface ContentMemoryState {
  items: ContentMemoryItem[];
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'OK';

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  ok: (...args: unknown[]) => void;
}
