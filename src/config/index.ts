import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

function intOr(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function pathOr(name: string, def: string): string {
  const v = process.env[name];
  return v && v.trim() ? path.resolve(v) : def;
}

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = pathOr('DATA_DIR', path.join(ROOT, 'data'));
const USER_DATA_DIR = pathOr('USER_DATA_DIR', path.join(ROOT, 'user-data'));

export const config = {
  paths: {
    root: ROOT,
    data: DATA_DIR,
    userData: USER_DATA_DIR,
    logs: path.join(DATA_DIR, 'logs'),
    errors: path.join(DATA_DIR, 'errors'),
    posted: path.join(DATA_DIR, 'posted.json'),
    queue: path.join(DATA_DIR, 'queue.json'),
    control: path.join(DATA_DIR, 'control.json'),
    contentMemory: path.join(DATA_DIR, 'content-memory.json'),
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
    tweetsPerDay: intOr('TWEETS_PER_DAY', 20),
    dispatchStartHour: intOr('DISPATCH_START_HOUR', 9),
    dispatchIntervalMin: 30,
    scheduleJitterMin: 5,
    scheduleJitterMax: 12,
    maxAttempts: intOr('MAX_ATTEMPTS', 3),
    circuitBreakerFailures: 3,
    circuitBreakerPauseMin: 60,
  },
  server: {
    port: intOr('PORT', 3000),
    adminToken: process.env.ADMIN_TOKEN ?? '',
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
