import crypto from 'crypto';
import { fetchTrending } from '../sources/githubTrending';
import { generateTweet, generateThread, generateDigest } from '../ai/openrouter';
import * as posted from '../storage/posted';
import * as queue from '../storage/queue';
import * as contentMemory from '../storage/contentMemory';
import { buildDailyMix, isDigestDay } from '../content/strategy';
import type { FormatSlot } from '../content/strategy';
import { scoreRepo, isQualityRepo } from '../content/scoring';
import { inferTopic } from '../content/topics';
import { get } from '../storage/settings';
import { getFormatConfig } from '../ai/prompts';
import { fetchRepoOgImage } from '../core/media';
import type { QueueItem, TrendingRepo, ContentFormat, EngagementObjective, Topic } from '../types';
import { make } from '../utils/logger';

const log = make('collect');
const DIGEST_MIN_REPOS = 3;
const DIGEST_MAX_REPOS = 7;
const SIMILARITY_MAX_ATTEMPTS = 3;
const FALLBACK_INTERVAL_MS = 30 * 60 * 1000;
const SOURCE_DAILY = 'github-trending';
const SOURCE_WEEKLY = 'github-trending-weekly';

function label(accountId?: string): string {
  return accountId ?? 'default';
}

function startOfLocalDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fallbackSlot(idx: number): string {
  return new Date(Date.now() + idx * FALLBACK_INTERVAL_MS).toISOString();
}

function slotAt(slots: Date[], idx: number): string {
  return slots[idx]?.toISOString() ?? fallbackSlot(idx);
}

function deduped(repos: TrendingRepo[], accountId?: string): TrendingRepo[] {
  const seen = new Set(posted.allRepos(accountId).map((r) => r.toLowerCase()));
  const queued = new Set(queue.pendingRepoSlugs(accountId));
  return repos.filter(
    (r) => !seen.has(r.slug.toLowerCase()) && !queued.has(r.slug.toLowerCase())
  );
}

async function loadFreshCandidates(
  since: 'daily' | 'weekly',
  accountId?: string
): Promise<TrendingRepo[]> {
  const trending = await fetchTrending({ since });
  log.info(`GitHub Trending (${since}): ${trending.length} repo`);
  const candidates = deduped(trending, accountId);
  log.info(`Dedup sonrasi: ${candidates.length} aday`);
  return candidates;
}

interface RemainingInfo {
  count: number;
  posted: number;
  queued: number;
}

function logAndCheckRemaining(accountId?: string): RemainingInfo {
  const postedCount = posted.countSince(startOfLocalDay(), accountId);
  const queuedCount = queue.summary(accountId).active;
  const tweetsPerDay = get<number>('tweets_per_day', 8);
  const count = Math.max(0, tweetsPerDay - postedCount - queuedCount);
  log.info(`Gunluk limit: ${postedCount} atildi, ${queuedCount} aktif, ${count} kalan.`);
  return { count, posted: postedCount, queued: queuedCount };
}

async function generateUniqueTweet(
  repo: TrendingRepo,
  format: ContentFormat,
  accountId?: string
): Promise<string> {
  let text = '';
  for (let attempt = 0; attempt < SIMILARITY_MAX_ATTEMPTS; attempt++) {
    text = await generateTweet(repo, format);
    const reason = contentMemory.similarityReason(text, accountId);
    if (!reason) break;
    log.warn(`${repo.slug} benzer tweet elendi (${attempt + 1}/${SIMILARITY_MAX_ATTEMPTS}): ${reason}`);
    text = '';
  }
  if (!text) throw new Error('Benzer olmayan tweet uretilemedi');
  return text;
}

function wireThreadParents(enqueued: QueueItem[]): void {
  const groups = new Map<string, string[]>();
  for (const item of enqueued) {
    if (!item.threadGroupId) continue;
    const ids = groups.get(item.threadGroupId) ?? [];
    ids.push(item.id);
    groups.set(item.threadGroupId, ids);
  }
  for (const [, ids] of groups) {
    for (let i = 1; i < ids.length; i++) {
      queue.update(ids[i], { parentId: ids[0] });
    }
  }
}

function commit(items: queue.EnqueueInput[], accountId?: string): QueueItem[] {
  if (items.length === 0) return [];
  const enqueued = queue.enqueue(items, accountId);
  wireThreadParents(enqueued);
  log.ok(`@${label(accountId)} ${enqueued.length} tweet kuyruga eklendi.`);
  return enqueued;
}

interface BuildItemOpts {
  repo: TrendingRepo;
  text: string;
  scheduledAt: string;
  format: ContentFormat;
  objective?: EngagementObjective;
  topic?: Topic;
  source?: string;
  score?: number;
  threadGroupId?: string;
  mediaPath?: string;
}

function buildEnqueueInput(opts: BuildItemOpts): queue.EnqueueInput {
  return {
    repo: opts.repo.slug,
    url: opts.repo.url,
    text: opts.text,
    scheduledAt: opts.scheduledAt,
    format: opts.format,
    objective: opts.objective,
    topic: opts.topic,
    source: opts.source ?? SOURCE_DAILY,
    score: opts.score,
    threadGroupId: opts.threadGroupId,
    mediaPath: opts.mediaPath,
  };
}

const DEFAULT_HOUR_WEIGHTS: Record<string, number> = {
  '9': 0.3, '10': 0.4, '11': 0.6,
  '12': 1.0, '13': 1.0, '14': 0.9,
  '15': 0.6, '16': 0.6, '17': 0.7,
  '18': 0.9, '19': 1.4, '20': 1.5, '21': 1.3, '22': 0.8,
};

function pickWeightedHour(weights: Record<string, number>, hours: number[], total: number): number {
  let r = Math.random() * total;
  for (const h of hours) {
    r -= weights[String(h)] ?? 0;
    if (r <= 0) return h;
  }
  return hours[hours.length - 1];
}

export function buildSchedule(count: number, baseDate: Date = new Date()): Date[] {
  if (count <= 0) return [];

  const intervalMin = get<number>('dispatch_interval_min', 45);
  const jitterMin = get<number>('schedule_jitter_min', 15);
  const jitterMax = get<number>('schedule_jitter_max', 45);
  const rawWeights = get<Record<string, number>>('schedule.hour_weights', DEFAULT_HOUR_WEIGHTS);
  const weights =
    rawWeights && Object.keys(rawWeights).length > 0 ? rawWeights : DEFAULT_HOUR_WEIGHTS;

  const hours = Object.keys(weights)
    .map(Number)
    .filter((h) => Number.isInteger(h) && h >= 0 && h < 24)
    .sort((a, b) => a - b);
  const totalWeight = hours.reduce((s, h) => s + (weights[String(h)] ?? 0), 0);

  const minIntervalMs = intervalMin * 60 * 1000;
  const jitterRangeMs = Math.max(0, (jitterMax - jitterMin) * 60 * 1000);
  const jitterFloorMs = jitterMin * 60 * 1000;
  const nowMs = baseDate.getTime();

  // Build candidate slots across multiple days, then greedily enforce min interval.
  const candidates: number[] = [];
  for (let dayOffset = 0; dayOffset < 7 && candidates.length < count * 4; dayOffset++) {
    const dayStart = new Date(baseDate);
    dayStart.setDate(dayStart.getDate() + dayOffset);
    dayStart.setHours(0, 0, 0, 0);
    for (let i = 0; i < count * 2; i++) {
      const h = pickWeightedHour(weights, hours, totalWeight);
      const m = Math.floor(Math.random() * 60);
      const s = Math.floor(Math.random() * 60);
      const ts = dayStart.getTime() + h * 3600_000 + m * 60_000 + s * 1000;
      if (ts > nowMs) candidates.push(ts);
    }
  }

  candidates.sort((a, b) => a - b);

  const slots: Date[] = [];
  for (const ts of candidates) {
    if (slots.length === 0) {
      slots.push(new Date(ts));
    } else {
      const last = slots[slots.length - 1].getTime();
      const minNext = last + minIntervalMs + jitterFloorMs + Math.random() * jitterRangeMs;
      if (ts >= minNext) slots.push(new Date(ts));
    }
    if (slots.length >= count) break;
  }

  // Fallback: pad with linear extension if hour-weighted picks couldn't fill.
  while (slots.length < count) {
    const lastMs = slots[slots.length - 1]?.getTime() ?? nowMs;
    const next = lastMs + minIntervalMs + jitterFloorMs + Math.random() * jitterRangeMs;
    slots.push(new Date(next));
  }

  return slots;
}

async function processSlot(
  repo: TrendingRepo,
  score: number,
  slotIdx: number,
  slots: Date[],
  slot: FormatSlot,
  accountId?: string,
  threadGroupId?: string
): Promise<{ items: queue.EnqueueInput[]; slotCount: number } | null> {
  const topic = inferTopic(repo);
  const baseOpts = {
    repo,
    format: slot.format,
    objective: slot.objective,
    topic,
    score,
  };

  if (threadGroupId) {
    const tweets = await generateThread(repo, repo.url);
    const items = tweets.map((text, i) => {
      contentMemory.add(repo.slug, text, accountId);
      return buildEnqueueInput({
        ...baseOpts,
        format: 'mini_thread',
        objective: 'dwell',
        text,
        scheduledAt: slotAt(slots, slotIdx + i),
        threadGroupId,
      });
    });
    log.ok(`${repo.slug} — thread (${tweets.length} tweet)`);
    return { items, slotCount: tweets.length };
  }

  const text = await generateUniqueTweet(repo, slot.format, accountId);
  contentMemory.add(repo.slug, text, accountId);
  log.ok(`${repo.slug} [${slot.format}] score=${score} — ${text.length} char`);

  const cfg = getFormatConfig(slot.format);
  const mediaPath =
    cfg.media === 'og_image' ? (await fetchRepoOgImage(repo)) ?? undefined : undefined;

  const linkAsReply =
    slot.format === 'repo_drop' && (cfg.linkAsReply ?? false)
      ? get<boolean>('format.repo_drop.link_as_reply', true)
      : false;

  if (linkAsReply) {
    const groupId = crypto.randomBytes(4).toString('hex');
    return {
      items: [
        buildEnqueueInput({
          ...baseOpts,
          text,
          scheduledAt: slotAt(slots, slotIdx),
          threadGroupId: groupId,
          mediaPath,
        }),
        buildEnqueueInput({
          ...baseOpts,
          text: `kaynak: ${repo.url}`,
          scheduledAt: slotAt(slots, slotIdx + 1),
          threadGroupId: groupId,
          score: undefined,
        }),
      ],
      slotCount: 2,
    };
  }

  return {
    items: [
      buildEnqueueInput({
        ...baseOpts,
        text,
        scheduledAt: slotAt(slots, slotIdx),
        mediaPath,
      }),
    ],
    slotCount: 1,
  };
}

interface CandidatePair {
  repo: TrendingRepo;
  score: number;
  slot: FormatSlot;
}

async function generateItemsForCandidates(
  pairs: CandidatePair[],
  schedule: Date[],
  accountId?: string,
  startSlotIdx = 0
): Promise<queue.EnqueueInput[]> {
  const items: queue.EnqueueInput[] = [];
  let slotIdx = startSlotIdx;

  for (const { repo, score, slot } of pairs) {
    try {
      const threadGroupId =
        slot.isThread && slot.format === 'mini_thread'
          ? crypto.randomBytes(4).toString('hex')
          : undefined;

      const result = await processSlot(repo, score, slotIdx, schedule, slot, accountId, threadGroupId);
      if (result) {
        items.push(...result.items);
        slotIdx += result.slotCount;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`${repo.slug} icin tweet uretilemedi: ${msg}`);
    }
  }

  return items;
}

export async function run(accountId?: string): Promise<QueueItem[]> {
  log.info(`Basladi @${label(accountId)}`);

  if (isDigestDay(new Date())) {
    return runDigestDay(accountId);
  }

  const candidates = await loadFreshCandidates('daily', accountId);
  const scored = candidates
    .map((repo) => ({ repo, score: scoreRepo(repo) }))
    .filter((item) => isQualityRepo(item.score))
    .sort((a, b) => b.score.total - a.score.total);
  log.info(`Scoring sonrasi: ${scored.length} kaliteli aday`);

  const { count: remaining } = logAndCheckRemaining(accountId);
  if (remaining === 0 || scored.length === 0) {
    log.warn('Tweet uretilecek slot veya yeni repo yok.');
    return [];
  }

  const target = Math.min(remaining, scored.length);
  const mix = buildDailyMix(target, new Date());
  const schedule = buildSchedule(target + mix.filter((s) => s.isThread).length * 2);

  const pairs: CandidatePair[] = [];
  for (let i = 0; i < mix.length && i < scored.length; i++) {
    pairs.push({ repo: scored[i].repo, score: scored[i].score.total, slot: mix[i] });
  }

  const items = await generateItemsForCandidates(pairs, schedule, accountId);
  return commit(items, accountId);
}

async function buildDigestItem(
  repos: TrendingRepo[],
  scheduledAt: string,
  accountId?: string
): Promise<queue.EnqueueInput | null> {
  try {
    const digestText = await generateDigest(repos);
    contentMemory.add('weekly-digest', digestText, accountId);
    log.ok(`Digest tweet: ${digestText.length} char`);
    return {
      repo: 'weekly-digest',
      url: repos[0].url,
      text: digestText,
      scheduledAt,
      format: 'weekly_digest',
      objective: 'bookmark',
      topic: 'other',
      source: SOURCE_WEEKLY,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`Digest uretilemedi: ${msg}`);
    return null;
  }
}

async function runDigestDay(accountId?: string): Promise<QueueItem[]> {
  log.info(`Cuma — haftalik digest modu @${label(accountId)}`);

  const fresh = await loadFreshCandidates('weekly', accountId);
  if (fresh.length < DIGEST_MIN_REPOS) {
    log.warn('Digest icin yeterli yeni repo yok, normal moda donuluyor.');
    return run(accountId);
  }

  const { count: remaining } = logAndCheckRemaining(accountId);
  if (remaining === 0) return [];

  const items: queue.EnqueueInput[] = [];
  const digestSchedule = buildSchedule(Math.min(remaining, 6));

  const digestItem = await buildDigestItem(
    fresh.slice(0, DIGEST_MAX_REPOS),
    digestSchedule[0].toISOString(),
    accountId
  );
  if (digestItem) items.push(digestItem);

  const normalRepos = fresh.slice(DIGEST_MAX_REPOS);
  const normalCount = Math.min(remaining - items.length, normalRepos.length);

  if (normalCount > 0) {
    const normalMix = buildDailyMix(normalCount, new Date());
    const normalSchedule = buildSchedule(normalCount + items.length);
    const pairs: CandidatePair[] = normalRepos.slice(0, normalCount).map((repo, i) => ({
      repo,
      score: 0,
      slot: normalMix[i % normalMix.length],
    }));
    const normalItems = await generateItemsForCandidates(pairs, normalSchedule, accountId, items.length);
    items.push(...normalItems);
  }

  return commit(items, accountId);
}

if (require.main === module) {
  run().catch((e) => {
    log.error(e);
    process.exit(1);
  });
}
