import crypto from 'crypto';
import { config } from '../config';
import { getDb } from './db';
import { getDefaultAccountId } from './accounts';
import type { ContentFormat, EngagementObjective } from '../types';

function resolveAccountId(accountId?: string): string | null {
  return accountId ?? getDefaultAccountId();
}

export interface AnalyticsEvent {
  id: string;
  timestamp: string;
  type: 'post_success' | 'post_failure' | 'reply_success' | 'reply_failure' | 'thread_complete';
  format?: ContentFormat;
  objective?: EngagementObjective;
  repo: string;
  topic?: string;
  source?: string;
  tweetId?: string;
  tweetUrl?: string;
  durationMs?: number;
  errorMessage?: string;
  accountId?: string;
}

export interface FormatStats {
  format: string;
  total: number;
  success: number;
  failure: number;
  successRate: number;
  avgDurationMs: number;
}

export interface DailyStats {
  date: string;
  total: number;
  success: number;
  failure: number;
  postsByFormat: Record<string, number>;
  postsByTopic: Record<string, number>;
  topRepos: Array<{ repo: string; count: number }>;
  avgDurationMs: number;
}

export interface WeeklyStats {
  startDate: string;
  endDate: string;
  totalPosts: number;
  totalSuccess: number;
  totalFailure: number;
  successRate: number;
  formatStats: FormatStats[];
  topicDistribution: Record<string, number>;
  topRepos: Array<{ repo: string; count: number }>;
  avgDurationMs: number;
  dailyBreakdown: DailyStats[];
}

export function recordEvent(event: Omit<AnalyticsEvent, 'id' | 'timestamp'>): void {
  const db = getDb(config.paths.db);
  const id = crypto.randomBytes(6).toString('hex');
  const timestamp = new Date().toISOString();

  db.prepare(`
    INSERT INTO analytics_events (id, timestamp, type, format, objective, repo, topic, source,
      tweet_id, tweet_url, duration_ms, error_message, account_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    timestamp,
    event.type,
    event.format ?? null,
    event.objective ?? null,
    event.repo,
    event.topic ?? null,
    event.source ?? null,
    event.tweetId ?? null,
    event.tweetUrl ?? null,
    event.durationMs ?? null,
    event.errorMessage ?? null,
    event.accountId ?? null
  );
}

export function getDailyStats(date: Date, accountId?: string): DailyStats {
  const db = getDb(config.paths.db);
  const acctId = resolveAccountId(accountId);
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const startIso = dayStart.toISOString();
  const endIso = dayEnd.toISOString();

  let events: Record<string, unknown>[];
  if (acctId) {
    events = db.prepare(
      `SELECT * FROM analytics_events WHERE timestamp >= ? AND timestamp < ? AND (account_id = ? OR account_id IS NULL)`
    ).all(startIso, endIso, acctId) as Record<string, unknown>[];
  } else {
    events = db.prepare(
      `SELECT * FROM analytics_events WHERE timestamp >= ? AND timestamp < ?`
    ).all(startIso, endIso) as Record<string, unknown>[];
  }

  return buildDailyStats(dayStart.toISOString().slice(0, 10), events);
}

export function getWeeklyStats(weekStart?: Date, accountId?: string): WeeklyStats {
  const db = getDb(config.paths.db);
  const acctId = resolveAccountId(accountId);
  const start = weekStart ?? getDefaultWeekStart();
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  let events: Record<string, unknown>[];
  if (acctId) {
    events = db.prepare(
      `SELECT * FROM analytics_events WHERE timestamp >= ? AND timestamp < ? AND (account_id = ? OR account_id IS NULL)`
    ).all(startIso, endIso, acctId) as Record<string, unknown>[];
  } else {
    events = db.prepare(
      `SELECT * FROM analytics_events WHERE timestamp >= ? AND timestamp < ?`
    ).all(startIso, endIso) as Record<string, unknown>[];
  }

  return buildWeeklyStats(start, end, events);
}

export function getFormatPerformance(since?: Date, accountId?: string): FormatStats[] {
  const db = getDb(config.paths.db);
  const acctId = resolveAccountId(accountId);
  const sinceIso = since ? since.toISOString() : '1970-01-01T00:00:00.000Z';

  let rows: Array<{ format: string; type: string; cnt: number; avg_dur: number | null }>;
  if (acctId) {
    rows = db.prepare(
      `SELECT format, type, COUNT(*) as cnt, AVG(duration_ms) as avg_dur
       FROM analytics_events
       WHERE timestamp >= ? AND format IS NOT NULL AND (account_id = ? OR account_id IS NULL)
       GROUP BY format, type`
    ).all(sinceIso, acctId) as Array<{ format: string; type: string; cnt: number; avg_dur: number | null }>;
  } else {
    rows = db.prepare(
      `SELECT format, type, COUNT(*) as cnt, AVG(duration_ms) as avg_dur
       FROM analytics_events
       WHERE timestamp >= ? AND format IS NOT NULL
       GROUP BY format, type`
    ).all(sinceIso) as Array<{ format: string; type: string; cnt: number; avg_dur: number | null }>;
  }

  const formatMap = new Map<string, { total: number; success: number; failure: number; totalDuration: number; durationCount: number }>();

  for (const row of rows) {
    let stats = formatMap.get(row.format);
    if (!stats) {
      stats = { total: 0, success: 0, failure: 0, totalDuration: 0, durationCount: 0 };
      formatMap.set(row.format, stats);
    }

    if (row.type.includes('success') || row.type === 'thread_complete') {
      stats.success += row.cnt;
      stats.total += row.cnt;
    } else if (row.type.includes('failure')) {
      stats.failure += row.cnt;
      stats.total += row.cnt;
    }
    if (row.avg_dur) {
      stats.totalDuration += row.avg_dur * row.cnt;
      stats.durationCount += row.cnt;
    }
  }

  return Array.from(formatMap.entries()).map(([format, s]) => ({
    format,
    total: s.total,
    success: s.success,
    failure: s.failure,
    successRate: s.total > 0 ? s.success / s.total : 0,
    avgDurationMs: s.durationCount > 0 ? s.totalDuration / s.durationCount : 0,
  })).sort((a, b) => b.total - a.total);
}

export function cleanup(olderThanDays: number): number {
  const db = getDb(config.paths.db);
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare(`DELETE FROM analytics_events WHERE timestamp < ?`).run(cutoff);
  return result.changes;
}

function getDefaultWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function buildDailyStats(dateStr: string, events: Record<string, unknown>[]): DailyStats {
  let success = 0;
  let failure = 0;
  let totalDuration = 0;
  let durationCount = 0;
  const byFormat: Record<string, number> = {};
  const byTopic: Record<string, number> = {};
  const repoCount: Record<string, number> = {};

  for (const e of events) {
    const type = e.type as string;
    if (type.includes('success') || type === 'thread_complete') success++;
    else if (type.includes('failure')) failure++;

    const fmt = (e.format as string) ?? 'unknown';
    byFormat[fmt] = (byFormat[fmt] ?? 0) + 1;

    const topic = (e.topic as string) ?? 'unknown';
    byTopic[topic] = (byTopic[topic] ?? 0) + 1;

    const repo = e.repo as string;
    repoCount[repo] = (repoCount[repo] ?? 0) + 1;

    if (e.duration_ms != null) {
      totalDuration += e.duration_ms as number;
      durationCount++;
    }
  }

  const topRepos = Object.entries(repoCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([repo, count]) => ({ repo, count }));

  return {
    date: dateStr,
    total: events.length,
    success,
    failure,
    postsByFormat: byFormat,
    postsByTopic: byTopic,
    topRepos,
    avgDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
  };
}

function buildWeeklyStats(start: Date, end: Date, events: Record<string, unknown>[]): WeeklyStats {
  let success = 0;
  let failure = 0;
  let totalDuration = 0;
  let durationCount = 0;
  const formatMap = new Map<string, { total: number; success: number; failure: number; totalDuration: number; durationCount: number }>();
  const topicDist: Record<string, number> = {};
  const repoCount: Record<string, number> = {};

  for (const e of events) {
    const type = e.type as string;
    if (type.includes('success') || type === 'thread_complete') success++;
    else if (type.includes('failure')) failure++;

    const fmt = (e.format as string) ?? 'unknown';
    let fs = formatMap.get(fmt);
    if (!fs) { fs = { total: 0, success: 0, failure: 0, totalDuration: 0, durationCount: 0 }; formatMap.set(fmt, fs); }
    fs.total++;

    if (type.includes('success') || type === 'thread_complete') fs.success++;
    else if (type.includes('failure')) { fs.failure++; }

    const topic = (e.topic as string) ?? 'unknown';
    topicDist[topic] = (topicDist[topic] ?? 0) + 1;

    const repo = e.repo as string;
    repoCount[repo] = (repoCount[repo] ?? 0) + 1;

    if (e.duration_ms != null) {
      totalDuration += e.duration_ms as number;
      durationCount++;
      fs.totalDuration += e.duration_ms as number;
      fs.durationCount++;
    }
  }

  const formatStats = Array.from(formatMap.entries()).map(([format, s]) => ({
    format,
    total: s.total,
    success: s.success,
    failure: s.failure,
    successRate: s.total > 0 ? s.success / s.total : 0,
    avgDurationMs: s.durationCount > 0 ? s.totalDuration / s.durationCount : 0,
  })).sort((a, b) => b.total - a.total);

  const topRepos = Object.entries(repoCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([repo, count]) => ({ repo, count }));

  const dailyBreakdown: DailyStats[] = [];
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const dayStart = new Date(d).toISOString();
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    const dayEvents = events.filter((e) => {
      const ts = e.timestamp as string;
      return ts >= dayStart && ts < nextDay.toISOString();
    });
    dailyBreakdown.push(buildDailyStats(dayStart.slice(0, 10), dayEvents));
  }

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    totalPosts: events.length,
    totalSuccess: success,
    totalFailure: failure,
    successRate: events.length > 0 ? success / events.length : 0,
    formatStats,
    topicDistribution: topicDist,
    topRepos,
    avgDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
    dailyBreakdown,
  };
}
