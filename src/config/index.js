const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Eksik env: ${name} (.env dosyasını kontrol et)`);
  }
  return v.trim();
}

function intOr(name, def) {
  const v = process.env[name];
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

const ROOT = path.resolve(__dirname, '..', '..');

const config = {
  paths: {
    root: ROOT,
    data: path.join(ROOT, 'data'),
    errors: path.join(ROOT, 'data', 'errors'),
    posted: path.join(ROOT, 'data', 'posted.json'),
    queue: path.join(ROOT, 'data', 'queue.json'),
  },
  x: {
    username: process.env.X_USERNAME || '',
    password: process.env.X_PASSWORD || '',
    headless: process.env.HEADLESS === 'true',
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
    referer: process.env.OPENROUTER_REFERER || 'https://github.com/tweetbot',
    appName: process.env.OPENROUTER_APP_NAME || 'tweetbot',
  },
  pipeline: {
    tweetsPerDay: intOr('TWEETS_PER_DAY', 10),
    dispatchStartHour: intOr('DISPATCH_START_HOUR', 9),
    dispatchIntervalMin: intOr('DISPATCH_INTERVAL_MIN', 30),
    maxAttempts: intOr('MAX_ATTEMPTS', 3),
  },
};

function assertOpenRouter() {
  if (!config.openrouter.apiKey) {
    throw new Error('OPENROUTER_API_KEY .env içinde tanımlı olmalı');
  }
}

function assertX() {
  if (!config.x.username || !config.x.password) {
    throw new Error('X_USERNAME ve X_PASSWORD .env içinde tanımlı olmalı');
  }
}

module.exports = { config, assertOpenRouter, assertX, required };
