import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

function intOr(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

const ROOT = path.resolve(__dirname, '..', '..');

export const config = {
  paths: {
    root: ROOT,
    data: path.join(ROOT, 'data'),
    logs: path.join(ROOT, 'data', 'logs'),
    errors: path.join(ROOT, 'data', 'errors'),
    posted: path.join(ROOT, 'data', 'posted.json'),
    queue: path.join(ROOT, 'data', 'queue.json'),
  },
  x: {
    username: process.env.X_USERNAME ?? '',
    password: process.env.X_PASSWORD ?? '',
    headless: process.env.HEADLESS === 'true',
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    model: process.env.OPENROUTER_MODEL ?? 'google/gemini-2.5-flash',
    referer: process.env.OPENROUTER_REFERER ?? 'https://github.com/tweetbot',
    appName: process.env.OPENROUTER_APP_NAME ?? 'tweetbot',
  },
  pipeline: {
    tweetsPerDay: intOr('TWEETS_PER_DAY', 10),
    dispatchStartHour: intOr('DISPATCH_START_HOUR', 9),
    dispatchIntervalMin: 5,
    maxAttempts: intOr('MAX_ATTEMPTS', 3),
  },
} as const;

export type AppConfig = typeof config;

export function assertOpenRouter(): void {
  if (!config.openrouter.apiKey) {
    throw new Error('OPENROUTER_API_KEY .env içinde tanımlı olmalı');
  }
}

export function assertX(): void {
  if (!config.x.username || !config.x.password) {
    throw new Error('X_USERNAME ve X_PASSWORD .env içinde tanımlı olmalı');
  }
}
