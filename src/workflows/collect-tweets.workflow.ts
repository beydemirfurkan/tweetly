import crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ContentFormat, EngagementObjective, TrendingRepo, Topic, FormatSlot } from '../domain/types/content.types';
import { inferTopic } from '../domain/services/topic-inference';
import { scoreRepo, isQualityRepo } from '../domain/services/repo-scoring';
import { getFormatConfig, FORMATS } from '../content-generation/prompt-registry';
import { GithubTrendingSource } from '../trending-source/github-trending.source';
import { OpenRouterService } from '../content-generation/openrouter.service';
import { MediaService } from '../content-generation/media.service';
import { ContentMemoryService } from '../content-memory/content-memory.service';
import { SettingsService } from '../settings/settings.service';
import { AnalyticsService, type FormatStats } from '../analytics/analytics.service';
import { ActionEnqueueService } from '../action-engine/action-enqueue.service';

const DIGEST_MIN_REPOS = 3;
const DIGEST_MAX_REPOS = 7;
const SIMILARITY_MAX_ATTEMPTS = 3;
const FALLBACK_INTERVAL_MS = 30 * 60 * 1000;
const SOURCE_DAILY = 'github-trending';
const SOURCE_WEEKLY = 'github-trending-weekly';

interface CandidatePair {
  repo: TrendingRepo;
  score: number;
  slot: FormatSlot;
}

interface EnqueueItem {
  repo: TrendingRepo;
  text: string;
  scheduledAt: Date;
  format: ContentFormat;
  objective?: EngagementObjective;
  topic?: Topic;
  source?: string;
  score?: number;
  mediaPath?: string;
  parentActionRef?: string | null;
  parentTweetUrl?: string;
}

@Injectable()
export class CollectTweetsWorkflow {
  private readonly log = new Logger(CollectTweetsWorkflow.name);

  constructor(
    private readonly trending: GithubTrendingSource,
    private readonly openrouter: OpenRouterService,
    private readonly media: MediaService,
    private readonly contentMemory: ContentMemoryService,
    private readonly settings: SettingsService,
    private readonly analytics: AnalyticsService,
    private readonly enqueue: ActionEnqueueService,
    private readonly dataSource: DataSource,
  ) {}

  async run(accountId?: string): Promise<void> {
    const label = accountId ?? 'default';
    this.log.log(`Basladi @${label}`);

    const digestDay = await this.settings.get<number>('digest.day', 5);
    if (new Date().getDay() === digestDay) {
      await this.runDigestDay(accountId);
    } else {
      await this.runDaily(accountId);
    }
  }

  private async runDaily(accountId?: string): Promise<void> {
    const candidates = await this.loadFreshCandidates('daily', accountId);
    const weights = await this.settings.getScoringWeights();
    const minScore = await this.settings.get<number>('min_repo_score', 40);

    const scored = scoreCandidates(candidates, weights)
      .filter(({ score }) => {
        const rs = { repo: '', total: score, breakdown: { relevance: 0, popularity: 0, trust: 0, clarity: 0, freshness: 0, novelty: 0, penalty: 0 } };
        return isQualityRepo(rs, minScore);
      })
      .sort((a, b) => b.score - a.score);

    this.log.log(`Scoring sonrasi: ${scored.length} kaliteli aday`);

    const { count: remaining } = await this.logAndCheckRemaining(accountId);
    if (remaining === 0 || scored.length === 0) {
      this.log.warn('Tweet uretilecek slot veya yeni repo yok.');
      return;
    }

    const target = Math.min(remaining, scored.length);
    const mix = await this.buildDailyMix(target);
    const schedule = await this.buildSchedule(estimateScheduleCount(mix));

    const pairs: CandidatePair[] = [];
    for (let i = 0; i < mix.length && i < scored.length; i++) {
      pairs.push({ repo: scored[i].repo, score: scored[i].score, slot: mix[i] });
    }

    await this.processAndEnqueue(pairs, schedule, accountId);
  }

  private async runDigestDay(accountId?: string): Promise<void> {
    const label = accountId ?? 'default';
    this.log.log(`Cuma — haftalik digest modu @${label}`);

    const fresh = await this.loadFreshCandidates('weekly', accountId);
    if (fresh.length < DIGEST_MIN_REPOS) {
      this.log.warn('Digest icin yeterli yeni repo yok, normal moda donuluyor.');
      return this.runDaily(accountId);
    }

    const { count: remaining } = await this.logAndCheckRemaining(accountId);
    if (remaining === 0) return;

    const digestSchedule = await this.buildSchedule(Math.min(remaining, 6));
    const items: EnqueueItem[] = [];

    const digestRepo: TrendingRepo = {
      owner: 'weekly-digest', name: 'digest', slug: 'weekly-digest',
      url: 'https://github.com/trending?since=weekly',
      description: '', language: '', starsToday: 0, totalStars: 0,
    };

    try {
      const digestText = await this.openrouter.generateDigest(fresh.slice(0, DIGEST_MAX_REPOS));
      await this.contentMemory.add('weekly-digest', digestText, accountId);
      this.log.log(`Digest tweet: ${digestText.length} char`);
      items.push({
        repo: digestRepo,
        text: digestText,
        scheduledAt: digestSchedule[0],
        format: 'weekly_digest',
        objective: 'bookmark',
        topic: 'other',
        source: SOURCE_WEEKLY,
      });
    } catch (err) {
      this.log.error(`Digest uretilemedi: ${err instanceof Error ? err.message : String(err)}`);
    }

    const normalRepos = fresh.slice(DIGEST_MAX_REPOS);
    const normalCount = Math.min(remaining - items.length, normalRepos.length);

    if (normalCount > 0) {
      const weights = await this.settings.getScoringWeights();
      const minScore = await this.settings.get<number>('min_repo_score', 40);
      const normalMix = await this.buildDailyMix(normalCount);
      const normalSchedule = await this.buildSchedule(items.length + estimateScheduleCount(normalMix));
      const scoredNormal = scoreCandidates(normalRepos, weights)
        .filter(({ score }) => {
          const rs = { repo: '', total: score, breakdown: { relevance: 0, popularity: 0, trust: 0, clarity: 0, freshness: 0, novelty: 0, penalty: 0 } };
          return isQualityRepo(rs, minScore);
        })
        .slice(0, normalCount);

      const pairs: CandidatePair[] = scoredNormal.map((item, i) => ({
        repo: item.repo,
        score: item.score,
        slot: normalMix[i % normalMix.length],
      }));
      const normalItems = await this.buildItemsForPairs(pairs, normalSchedule, accountId, items.length);
      items.push(...normalItems);
    }

    await this.commitItems(items, accountId);
  }

  private async processAndEnqueue(pairs: CandidatePair[], schedule: Date[], accountId?: string): Promise<void> {
    const items = await this.buildItemsForPairs(pairs, schedule, accountId);
    await this.commitItems(items, accountId);
  }

  private async buildItemsForPairs(
    pairs: CandidatePair[],
    schedule: Date[],
    accountId?: string,
    startSlotIdx = 0,
  ): Promise<EnqueueItem[]> {
    const items: EnqueueItem[] = [];
    let slotIdx = startSlotIdx;

    for (const { repo, score, slot } of pairs) {
      try {
        const result = await this.processSlot(repo, score, slotIdx, schedule, slot, accountId);
        if (result) {
          items.push(...result.items);
          slotIdx += result.slotCount;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.error(`${repo.slug} icin tweet uretilemedi: ${msg}`);
      }
    }

    return items;
  }

  private async processSlot(
    repo: TrendingRepo,
    score: number,
    slotIdx: number,
    slots: Date[],
    slot: FormatSlot,
    accountId?: string,
  ): Promise<{ items: EnqueueItem[]; slotCount: number } | null> {
    const topic = inferTopic(repo);

    if (slot.isThread && slot.format === 'mini_thread') {
      const tweets = await this.openrouter.generateThread(repo, repo.url);
      const threadGroupId = crypto.randomBytes(4).toString('hex');
      const threadItems: EnqueueItem[] = tweets.map((text, i) => {
        this.contentMemory.add(repo.slug, text, accountId).catch(() => void 0);
        return {
          repo,
          text,
          scheduledAt: slots[slotIdx + i] ?? new Date(Date.now() + (slotIdx + i) * FALLBACK_INTERVAL_MS),
          format: 'mini_thread' as ContentFormat,
          objective: 'dwell' as EngagementObjective,
          topic,
          source: SOURCE_DAILY,
          score,
        };
      });

      if (threadItems.length > 1) {
        // Wire thread: each tweet after the first becomes a reply to the first
        // We'll store thread group via metadata; parentTweetUrl resolved at dispatch time
        const parentRef = threadGroupId;
        threadItems.forEach((item, i) => {
          if (i > 0) item.parentActionRef = parentRef;
        });
      }

      this.log.log(`${repo.slug} — thread (${tweets.length} tweet)`);
      return { items: threadItems, slotCount: tweets.length };
    }

    const text = await this.generateUniqueTweet(repo, slot.format, accountId);
    this.contentMemory.add(repo.slug, text, accountId).catch(() => void 0);
    this.log.log(`${repo.slug} [${slot.format}] score=${score} — ${text.length} char`);

    const cfg = getFormatConfig(slot.format);
    const mediaPath = cfg.media === 'og_image' ? (await this.media.fetchRepoOgImage(repo)) ?? undefined : undefined;
    const linkAsReply =
      slot.format === 'repo_drop' && (cfg.linkAsReply ?? false)
        ? await this.settings.get<boolean>('format.repo_drop.link_as_reply', true)
        : false;

    if (linkAsReply) {
      const groupId = crypto.randomBytes(4).toString('hex');
      return {
        items: [
          {
            repo, text, mediaPath,
            scheduledAt: slots[slotIdx] ?? new Date(Date.now() + slotIdx * FALLBACK_INTERVAL_MS),
            format: slot.format, objective: slot.objective, topic, source: SOURCE_DAILY, score,
          },
          {
            repo,
            text: `kaynak: ${repo.url}`,
            scheduledAt: slots[slotIdx + 1] ?? new Date(Date.now() + (slotIdx + 1) * FALLBACK_INTERVAL_MS),
            format: slot.format, objective: slot.objective, topic, source: SOURCE_DAILY,
          },
        ],
        slotCount: 2,
      };
    }

    return {
      items: [{
        repo, text, mediaPath,
        scheduledAt: slots[slotIdx] ?? new Date(Date.now() + slotIdx * FALLBACK_INTERVAL_MS),
        format: slot.format, objective: slot.objective, topic, source: SOURCE_DAILY, score,
      }],
      slotCount: 1,
    };
  }

  private async generateUniqueTweet(
    repo: TrendingRepo,
    format: ContentFormat,
    accountId?: string,
  ): Promise<string> {
    let text = '';
    for (let attempt = 0; attempt < SIMILARITY_MAX_ATTEMPTS; attempt++) {
      text = await this.openrouter.generateTweet(repo, format);
      const reason = await this.contentMemory.similarityReason(text, accountId);
      if (!reason) break;
      this.log.warn(`${repo.slug} benzer tweet elendi (${attempt + 1}/${SIMILARITY_MAX_ATTEMPTS}): ${reason}`);
      text = '';
    }
    if (!text) throw new Error('Benzer olmayan tweet uretilemedi');
    return text;
  }

  private async commitItems(items: EnqueueItem[], accountId?: string): Promise<void> {
    if (items.length === 0) return;
    let enqueued = 0;
    const firstItemIds: string[] = [];

    for (const item of items) {
      const acctId = accountId ?? '';
      const metadata: Record<string, unknown> = {
        repo: item.repo.slug,
        repoUrl: item.repo.url,
        format: item.format,
        objective: item.objective,
        topic: item.topic,
        source: item.source,
        score: item.score,
      };

      try {
        const result = await this.enqueue.enqueuePost({
          accountId: acctId,
          text: item.text,
          mediaPath: item.mediaPath,
          scheduledAt: item.scheduledAt,
          metadata,
        });
        if (result.id) {
          enqueued++;
          firstItemIds.push(result.id);
        }
      } catch (err) {
        this.log.error(`Enqueue hatasi (${item.repo.slug}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.log.log(`@${accountId ?? 'default'} ${enqueued} tweet kuyruga eklendi.`);
  }

  private async loadFreshCandidates(since: 'daily' | 'weekly', accountId?: string): Promise<TrendingRepo[]> {
    const trending = await this.trending.fetchTrending({ since });
    this.log.log(`GitHub Trending (${since}): ${trending.length} repo`);
    const candidates = await this.deduped(trending, accountId);
    this.log.log(`Dedup sonrasi: ${candidates.length} aday`);
    return candidates;
  }

  private async deduped(repos: TrendingRepo[], accountId?: string): Promise<TrendingRepo[]> {
    const [postedSlugs, pendingSlugs] = await Promise.all([
      this.getAllPostedRepoSlugs(accountId),
      this.getPendingRepoSlugs(accountId),
    ]);
    const seen = new Set([...postedSlugs.map((s) => s.toLowerCase()), ...pendingSlugs.map((s) => s.toLowerCase())]);
    return repos.filter((r) => !seen.has(r.slug.toLowerCase()));
  }

  private async logAndCheckRemaining(accountId?: string): Promise<{ count: number; posted: number; queued: number }> {
    const [postedCount, queuedCount, tweetsPerDay] = await Promise.all([
      this.countSucceededToday(accountId),
      this.countPending(accountId),
      this.settings.get<number>('tweets_per_day', 8),
    ]);
    const count = Math.max(0, tweetsPerDay - postedCount - queuedCount);
    this.log.log(`Gunluk limit: ${postedCount} atildi, ${queuedCount} aktif, ${count} kalan.`);
    return { count, posted: postedCount, queued: queuedCount };
  }

  // -----------------------------------------------------------------------
  // Schedule builder
  // -----------------------------------------------------------------------

  async buildSchedule(count: number, baseDate: Date = new Date()): Promise<Date[]> {
    if (count <= 0) return [];

    const [intervalMin, jitterMin, jitterMax, rawWeights] = await Promise.all([
      this.settings.get<number>('dispatch_interval_min', 45),
      this.settings.get<number>('schedule_jitter_min', 15),
      this.settings.get<number>('schedule_jitter_max', 45),
      this.settings.get<Record<string, number>>('schedule.hour_weights', DEFAULT_HOUR_WEIGHTS),
    ]);

    const weights = rawWeights && Object.keys(rawWeights).length > 0 ? rawWeights : DEFAULT_HOUR_WEIGHTS;
    const hours = Object.keys(weights)
      .map(Number)
      .filter((h) => Number.isInteger(h) && h >= 0 && h < 24)
      .sort((a, b) => a - b);
    const totalWeight = hours.reduce((s, h) => s + (weights[String(h)] ?? 0), 0);

    const minIntervalMs = intervalMin * 60_000;
    const jitterRangeMs = Math.max(0, (jitterMax - jitterMin) * 60_000);
    const jitterFloorMs = jitterMin * 60_000;
    const nowMs = baseDate.getTime();

    const candidates: number[] = [];
    for (let dayOffset = 0; dayOffset < 7 && candidates.length < count * 4; dayOffset++) {
      const dayStart = new Date(baseDate);
      dayStart.setDate(dayStart.getDate() + dayOffset);
      dayStart.setHours(0, 0, 0, 0);
      for (let i = 0; i < count * 2; i++) {
        const h = pickWeightedHour(weights, hours, totalWeight);
        const m = Math.floor(Math.random() * 60);
        const s = Math.floor(Math.random() * 60);
        const ts = dayStart.getTime() + h * 3_600_000 + m * 60_000 + s * 1000;
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

    while (slots.length < count) {
      const lastMs = slots[slots.length - 1]?.getTime() ?? nowMs;
      const next = lastMs + minIntervalMs + jitterFloorMs + Math.random() * jitterRangeMs;
      slots.push(new Date(next));
    }

    return slots;
  }

  // -----------------------------------------------------------------------
  // Daily mix builder
  // -----------------------------------------------------------------------

  private async buildDailyMix(targetSlots: number): Promise<FormatSlot[]> {
    if (targetSlots <= 0) return [];

    const [digestDay, threadDays, rawWeights, adaptiveEnabled, minSamples, boostFactor, cutFactor] =
      await Promise.all([
        this.settings.get<number>('digest.day', 5),
        this.settings.getThreadDays(),
        this.settings.getFormatWeights(),
        this.settings.get<boolean>('format.adaptive.enabled', true),
        this.settings.get<number>('format.adaptive.min_samples', 5),
        this.settings.get<number>('format.adaptive.boost_factor', 1.5),
        this.settings.get<number>('format.adaptive.cut_factor', 0.5),
      ]);

    let weights = { ...rawWeights };

    if (adaptiveEnabled) {
      const last14d = new Date();
      last14d.setDate(last14d.getDate() - 14);
      const perf = await this.analytics.getFormatPerformance(last14d);
      const perfMap = new Map(perf.map((p) => [p.format, p] as [string, FormatStats]));

      for (const [format, baseWeight] of Object.entries(weights)) {
        const p = perfMap.get(format);
        if (!p || p.total < minSamples) continue;
        if (p.successRate >= 0.9) {
          weights[format] = Math.max(0.5, baseWeight * boostFactor);
        } else if (p.successRate < 0.5) {
          weights[format] = Math.max(0.5, baseWeight * cutFactor);
        }
      }
    }

    type MixRule = { format: ContentFormat; weight: number };
    const day = new Date().getDay();
    let mix: MixRule[];

    if (day === digestDay) {
      mix = [
        { format: 'weekly_digest', weight: weights.weekly_digest ?? 1 },
        { format: 'no_link_hook', weight: weights.no_link_hook ?? 2 },
        { format: 'repo_drop', weight: weights.repo_drop ?? 1 },
        { format: 'question', weight: weights.question ?? 1 },
        { format: 'bookmark_bait', weight: weights.bookmark_bait ?? 1 },
      ];
    } else if (threadDays.includes(day)) {
      mix = Object.entries(weights)
        .filter(([, w]) => w > 0)
        .map(([format, weight]) => ({ format: format as ContentFormat, weight }));
      if (!mix.find((r) => r.format === 'mini_thread')) {
        mix.push({ format: 'mini_thread', weight: weights.mini_thread ?? 1 });
      }
    } else {
      mix = Object.entries(weights)
        .filter(([format, w]) => w > 0 && format !== 'weekly_digest' && format !== 'mini_thread')
        .map(([format, weight]) => ({ format: format as ContentFormat, weight }));
    }

    const totalWeight = mix.reduce((sum, r) => sum + r.weight, 0);
    if (mix.length === 0 || totalWeight <= 0) {
      const fallback = getFormatConfig('repo_drop');
      return Array.from({ length: targetSlots }, () => ({
        format: 'repo_drop' as ContentFormat,
        objective: fallback.objective,
        isThread: fallback.isThread,
        threadCount: fallback.threadCount,
      }));
    }

    const slots: FormatSlot[] = [];
    for (const rule of mix) {
      const count = Math.round((rule.weight / totalWeight) * targetSlots);
      const cfg = getFormatConfig(rule.format);
      for (let i = 0; i < count; i++) {
        slots.push({ format: rule.format, objective: cfg.objective, isThread: cfg.isThread, threadCount: cfg.threadCount });
      }
    }

    while (slots.length < targetSlots) {
      const fallback = mix[Math.floor(Math.random() * mix.length)];
      const cfg = getFormatConfig(fallback.format);
      slots.push({ format: fallback.format, objective: cfg.objective, isThread: cfg.isThread, threadCount: cfg.threadCount });
    }
    while (slots.length > targetSlots) {
      const removable = slots.findIndex((s) => s.format !== 'no_link_hook' && s.format !== 'repo_drop');
      if (removable >= 0) slots.splice(removable, 1);
      else slots.pop();
    }

    const linkSlots = slots.filter((s) => FORMATS[s.format].needsLink);
    const noLinkSlots = slots.filter((s) => !FORMATS[s.format].needsLink);
    return [...shuffle(linkSlots), ...shuffle(noLinkSlots)];
  }

  // -----------------------------------------------------------------------
  // DB helpers
  // -----------------------------------------------------------------------

  private async countSucceededToday(accountId?: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const rows: Array<{ cnt: string }> = accountId
      ? await this.dataSource.query(
          `SELECT COUNT(*)::text AS cnt FROM post_actions
            WHERE account_id=$1 AND status='succeeded' AND result_sent_at >= $2`,
          [accountId, startOfDay],
        )
      : await this.dataSource.query(
          `SELECT COUNT(*)::text AS cnt FROM post_actions WHERE status='succeeded' AND result_sent_at >= $1`,
          [startOfDay],
        );
    return parseInt(rows[0]?.cnt ?? '0', 10);
  }

  private async countPending(accountId?: string): Promise<number> {
    const rows: Array<{ cnt: string }> = accountId
      ? await this.dataSource.query(
          `SELECT COUNT(*)::text AS cnt FROM post_actions
            WHERE account_id=$1 AND status IN ('pending','claimed','running')`,
          [accountId],
        )
      : await this.dataSource.query(
          `SELECT COUNT(*)::text AS cnt FROM post_actions WHERE status IN ('pending','claimed','running')`,
        );
    return parseInt(rows[0]?.cnt ?? '0', 10);
  }

  private async getAllPostedRepoSlugs(accountId?: string): Promise<string[]> {
    const rows: Array<{ repo: string }> = accountId
      ? await this.dataSource.query(
          `SELECT DISTINCT metadata->>'repo' AS repo FROM post_actions
            WHERE account_id=$1 AND status='succeeded' AND metadata->>'repo' IS NOT NULL`,
          [accountId],
        )
      : await this.dataSource.query(
          `SELECT DISTINCT metadata->>'repo' AS repo FROM post_actions
            WHERE status='succeeded' AND metadata->>'repo' IS NOT NULL`,
        );
    return rows.map((r) => r.repo).filter(Boolean);
  }

  private async getPendingRepoSlugs(accountId?: string): Promise<string[]> {
    const rows: Array<{ repo: string }> = accountId
      ? await this.dataSource.query(
          `SELECT DISTINCT metadata->>'repo' AS repo FROM post_actions
            WHERE account_id=$1 AND status IN ('pending','claimed','running')
              AND metadata->>'repo' IS NOT NULL`,
          [accountId],
        )
      : await this.dataSource.query(
          `SELECT DISTINCT metadata->>'repo' AS repo FROM post_actions
            WHERE status IN ('pending','claimed','running') AND metadata->>'repo' IS NOT NULL`,
        );
    return rows.map((r) => r.repo).filter(Boolean);
  }
}

// -----------------------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------------------

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

function estimateScheduleCount(mix: FormatSlot[]): number {
  return mix.reduce((total, slot) => {
    const cfg = getFormatConfig(slot.format);
    if (slot.isThread) return total + Math.max(cfg.threadCount, 1);
    return total + 1;
  }, 0);
}

function scoreCandidates(
  candidates: TrendingRepo[],
  weights: Record<string, number>,
): Array<{ repo: TrendingRepo; score: number }> {
  const baseRanked = candidates
    .map((repo) => ({ repo, score: scoreRepo(repo, weights).total }))
    .sort((a, b) => b.score - a.score);

  const topicCounts: Partial<Record<Topic, number>> = {};
  const ownerCounts = new Map<string, number>();

  return baseRanked.map(({ repo }) => {
    const topic = inferTopic(repo);
    const owner = repo.owner.toLowerCase();
    const rescored = scoreRepo(repo, weights, topicCounts, ownerCounts.get(owner) ?? 0).total;
    topicCounts[topic] = (topicCounts[topic] ?? 0) + 1;
    ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
    return { repo, score: rescored };
  }).sort((a, b) => b.score - a.score);
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
