import crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { IContentWorkflow } from './content-workflow.interface';
import type { ContentFormat, EngagementObjective, TrendingRepo, Topic, FormatSlot } from '../domain/types/content.types';
import { inferTopic } from '../domain/services/topic-inference';
import { scoreRepo, isQualityRepo } from '../domain/services/repo-scoring';
import { isStrongSourceCandidate, scoreSourceCandidate } from '../domain/services/source-quality-scoring';
import { getFormatConfig, FORMATS } from '../content-generation/prompt-registry';
import { GithubTrendingSource } from '../trending-source/github-trending.source';
import { ExternalTechSource } from '../trending-source/external-tech.source';
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

export interface GrowthTargetOptions {
  growthEnabled: boolean;
  rampUpEnabled: boolean;
  legacyTarget: number;
  baseDate: Date;
  rampUpStartDate: string;
  weekdayTargetMin: number;
  weekdayTargetMax: number;
  weekendTargetMin: number;
  weekendTargetMax: number;
  week1WeekdayTarget: number;
  week1WeekendTarget: number;
  week2WeekdayTarget: number;
  week2WeekendTarget: number;
}

export interface GrowthSafetyOptions {
  safetyEnabled: boolean;
  legacyTarget: number;
  target: number;
  authFailures: number;
  authFailureSoftLimit: number;
  postFailureRate: number;
  postFailureSamples: number;
  postFailureMinSamples: number;
  postFailureRateThreshold: number;
  reductionFactor: number;
}

@Injectable()
export class GithubTrendingWorkflow implements IContentWorkflow {
  readonly scenarioType = 'github_trending';
  private readonly log = new Logger(GithubTrendingWorkflow.name);

  constructor(
    private readonly trending: GithubTrendingSource,
    private readonly openrouter: OpenRouterService,
    private readonly media: MediaService,
    private readonly contentMemory: ContentMemoryService,
    private readonly settings: SettingsService,
    private readonly analytics: AnalyticsService,
    private readonly enqueue: ActionEnqueueService,
    private readonly dataSource: DataSource,
    private readonly externalTech: ExternalTechSource,
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
    const schedule = await this.buildSchedule(estimateScheduleCount(mix), new Date(), accountId);

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

    const digestSchedule = await this.buildSchedule(Math.min(remaining, 6), new Date(), accountId);
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
      const normalSchedule = await this.buildSchedule(items.length + estimateScheduleCount(normalMix), new Date(), accountId);
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
    const itemSource = repo.sourceId ?? SOURCE_DAILY;

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
          source: itemSource,
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
    const mediaPath = cfg.media === 'og_image' && (!repo.sourceType || repo.sourceType === 'github')
      ? (await this.media.fetchRepoOgImage(repo)) ?? undefined
      : undefined;
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
            format: slot.format, objective: slot.objective, topic, source: itemSource, score,
          },
          {
            repo,
            text: `kaynak: ${repo.url}`,
            scheduledAt: slots[slotIdx + 1] ?? new Date(Date.now() + (slotIdx + 1) * FALLBACK_INTERVAL_MS),
            format: slot.format, objective: slot.objective, topic, source: itemSource,
          },
        ],
        slotCount: 2,
      };
    }

    return {
      items: [{
        repo, text, mediaPath,
        scheduledAt: slots[slotIdx] ?? new Date(Date.now() + slotIdx * FALLBACK_INTERVAL_MS),
        format: slot.format, objective: slot.objective, topic, source: itemSource, score,
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
        sourceType: item.repo.sourceType ?? 'github',
        sourceName: item.repo.sourceName ?? 'GitHub',
        sourceScore: item.repo.sourceScore,
        sourceScoreBreakdown: item.repo.sourceScoreBreakdown,
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

    const expanded = since === 'daily'
      ? [...trending, ...(await this.loadExternalCandidates(accountId))]
      : trending;
    const candidates = await this.deduped(expanded, accountId);
    this.log.log(`Dedup sonrasi: ${candidates.length} aday`);
    return candidates;
  }

  private async loadExternalCandidates(accountId?: string): Promise<TrendingRepo[]> {
    const enabled = await this.settings.get<boolean>('source_expansion.enabled', false, accountId);
    if (!enabled) return [];

    const [includeHackerNews, includeDevTo, hackerNewsLimit, devToLimit, maxDaily, minScore, weights] = await Promise.all([
      this.settings.get<boolean>('source_expansion.hacker_news.enabled', true, accountId),
      this.settings.get<boolean>('source_expansion.dev_to.enabled', true, accountId),
      this.settings.get<number>('source_expansion.hacker_news.limit', 25, accountId),
      this.settings.get<number>('source_expansion.dev_to.limit', 25, accountId),
      this.settings.get<number>('source_expansion.max_daily_candidates', 15, accountId),
      this.settings.get<number>('source_expansion.min_score', 70, accountId),
      this.settings.getSourceQualityWeights(),
    ]);

    const raw = await this.externalTech.fetchCandidates({
      includeHackerNews,
      includeDevTo,
      hackerNewsLimit,
      devToLimit,
    });

    const scored = raw
      .map((candidate) => {
        const scoredCandidate = scoreSourceCandidate(candidate, weights);
        return {
          ...candidate,
          sourceScore: scoredCandidate.total,
          sourceScoreBreakdown: scoredCandidate.breakdown,
        } satisfies TrendingRepo;
      })
      .filter((candidate) => {
        const breakdown = candidate.sourceScoreBreakdown;
        return breakdown
          ? isStrongSourceCandidate({ total: candidate.sourceScore ?? 0, breakdown }, minScore)
          : false;
      })
      .sort((a, b) => (b.sourceScore ?? 0) - (a.sourceScore ?? 0))
      .slice(0, Math.max(0, maxDaily));

    this.log.log(`Source expansion: ${scored.length}/${raw.length} kaliteli harici aday`);
    return scored;
  }

  private async deduped(repos: TrendingRepo[], accountId?: string): Promise<TrendingRepo[]> {
    const [postedSlugs, pendingSlugs] = await Promise.all([
      this.getAllPostedRepoSlugs(accountId),
      this.getPendingRepoSlugs(accountId),
    ]);
    const seen = new Set([...postedSlugs.map((s) => s.toLowerCase()), ...pendingSlugs.map((s) => s.toLowerCase())]);
    const seenUrls = new Set<string>();
    return repos.filter((r) => {
      const slug = r.slug.toLowerCase();
      const url = r.url.toLowerCase();
      if (seen.has(slug) || seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    });
  }

  private async logAndCheckRemaining(accountId?: string): Promise<{ count: number; posted: number; queued: number }> {
    const [postedCount, queuedCount, tweetsPerDay] = await Promise.all([
      this.countSucceededToday(accountId),
      this.countPending(accountId),
      this.getEffectiveDailyTarget(accountId),
    ]);
    const count = Math.max(0, tweetsPerDay - postedCount - queuedCount);
    this.log.log(`Gunluk hedef: ${tweetsPerDay}, ${postedCount} atildi, ${queuedCount} aktif, ${count} kalan.`);
    return { count, posted: postedCount, queued: queuedCount };
  }

  private async getEffectiveDailyTarget(accountId?: string, baseDate: Date = new Date()): Promise<number> {
    const [
      legacyTarget,
      growthEnabled,
      rampUpEnabled,
      rampUpStartDate,
      weekdayTargetMin,
      weekdayTargetMax,
      weekendTargetMin,
      weekendTargetMax,
      week1WeekdayTarget,
      week1WeekendTarget,
      week2WeekdayTarget,
      week2WeekendTarget,
    ] = await Promise.all([
      this.settings.get<number>('tweets_per_day', 13, accountId),
      this.settings.get<boolean>('growth.enabled', false, accountId),
      this.settings.get<boolean>('growth.ramp_up.enabled', false, accountId),
      this.settings.get<string>('growth.ramp_up.start_date', '', accountId),
      this.settings.get<number>('growth.weekday_target_min', 20, accountId),
      this.settings.get<number>('growth.weekday_target_max', 23, accountId),
      this.settings.get<number>('growth.weekend_target_min', 24, accountId),
      this.settings.get<number>('growth.weekend_target_max', 28, accountId),
      this.settings.get<number>('growth.ramp_up.week1.weekday_target', 17, accountId),
      this.settings.get<number>('growth.ramp_up.week1.weekend_target', 20, accountId),
      this.settings.get<number>('growth.ramp_up.week2.weekday_target', 20, accountId),
      this.settings.get<number>('growth.ramp_up.week2.weekend_target', 23, accountId),
    ]);

    const target = resolveGrowthDailyTarget({
      growthEnabled,
      rampUpEnabled,
      legacyTarget,
      baseDate,
      rampUpStartDate,
      weekdayTargetMin,
      weekdayTargetMax,
      weekendTargetMin,
      weekendTargetMax,
      week1WeekdayTarget,
      week1WeekendTarget,
      week2WeekdayTarget,
      week2WeekendTarget,
    });

    if (!growthEnabled) return target;

    const [
      safetyEnabled,
      authFailureSoftLimit,
      postFailureRateThreshold,
      postFailureMinSamples,
      reductionFactor,
      authFailures,
      postFailureStats,
    ] = await Promise.all([
      this.settings.get<boolean>('growth.safety.enabled', true, accountId),
      this.settings.get<number>('growth.safety.auth_failure_soft_limit', 1, accountId),
      this.settings.get<number>('growth.safety.post_failure_rate_threshold', 0.2, accountId),
      this.settings.get<number>('growth.safety.post_failure_min_samples', 5, accountId),
      this.settings.get<number>('growth.safety.reduction_factor', 0.5, accountId),
      this.getControlNumber(accountId, 'session.auth_failure_count'),
      this.getPostFailureStatsToday(accountId),
    ]);

    const safeTarget = reduceGrowthTargetForSafety({
      safetyEnabled,
      legacyTarget,
      target,
      authFailures,
      authFailureSoftLimit,
      postFailureRate: postFailureStats.rate,
      postFailureSamples: postFailureStats.total,
      postFailureMinSamples,
      postFailureRateThreshold,
      reductionFactor,
    });

    if (safeTarget < target) {
      this.log.warn(`Growth hedefi guvenlik nedeniyle dusuruldu: ${target} -> ${safeTarget}`);
    }

    return safeTarget;
  }

  // -----------------------------------------------------------------------
  // Schedule builder
  // -----------------------------------------------------------------------

  async buildSchedule(count: number, baseDate: Date = new Date(), accountId?: string): Promise<Date[]> {
    if (count <= 0) return [];

    const growthEnabled = await this.settings.get<boolean>('growth.enabled', false, accountId);
    const weekend = isWeekendDay(baseDate.getDay());
    const [intervalMin, jitterMin, jitterMax, rawWeights] = await Promise.all([
      growthEnabled
        ? this.settings.get<number>('growth.dispatch_interval_min', 18, accountId)
        : this.settings.get<number>('dispatch_interval_min', 45, accountId),
      growthEnabled
        ? this.settings.get<number>('growth.schedule_jitter_min', 5, accountId)
        : this.settings.get<number>('schedule_jitter_min', 15, accountId),
      growthEnabled
        ? this.settings.get<number>('growth.schedule_jitter_max', 25, accountId)
        : this.settings.get<number>('schedule_jitter_max', 45, accountId),
      weekend && growthEnabled
        ? this.settings.get<Record<string, number>>('schedule.weekend_hour_weights', DEFAULT_WEEKEND_HOUR_WEIGHTS, accountId)
        : this.settings.get<Record<string, number>>('schedule.hour_weights', DEFAULT_HOUR_WEIGHTS, accountId),
    ]);

    const defaultWeights = weekend && growthEnabled ? DEFAULT_WEEKEND_HOUR_WEIGHTS : DEFAULT_HOUR_WEIGHTS;
    const initialWeights = rawWeights && Object.keys(rawWeights).length > 0 ? rawWeights : defaultWeights;
    let hours = Object.keys(initialWeights)
      .map(Number)
      .filter((h) => Number.isInteger(h) && h >= 0 && h < 24)
      .sort((a, b) => a - b);
    let weights = initialWeights;
    let totalWeight = hours.reduce((s, h) => s + (weights[String(h)] ?? 0), 0);
    if (hours.length === 0 || totalWeight <= 0) {
      weights = defaultWeights;
      hours = Object.keys(weights).map(Number).sort((a, b) => a - b);
      totalWeight = hours.reduce((s, h) => s + (weights[String(h)] ?? 0), 0);
    }

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

  private async getControlNumber(accountId: string | undefined, key: string): Promise<number> {
    const rows = (await this.dataSource.query(
      `SELECT value FROM control_state WHERE key = $1 AND account_id = $2`,
      [key, accountId ?? ''],
    )) as Array<{ value: string }>;
    const value = parseInt(rows[0]?.value ?? '0', 10);
    return Number.isFinite(value) ? value : 0;
  }

  private async getPostFailureStatsToday(accountId?: string): Promise<{ total: number; failed: number; rate: number }> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const rows: Array<{ total: string; failed: string }> = accountId
      ? await this.dataSource.query(
          `SELECT
              COUNT(*) FILTER (WHERE status IN ('succeeded','failed','dead'))::text AS total,
              COUNT(*) FILTER (WHERE status IN ('failed','dead'))::text AS failed
             FROM post_actions
            WHERE account_id=$1 AND updated_at >= $2`,
          [accountId, startOfDay],
        )
      : await this.dataSource.query(
          `SELECT
              COUNT(*) FILTER (WHERE status IN ('succeeded','failed','dead'))::text AS total,
              COUNT(*) FILTER (WHERE status IN ('failed','dead'))::text AS failed
             FROM post_actions
            WHERE updated_at >= $1`,
          [startOfDay],
        );
    const total = parseInt(rows[0]?.total ?? '0', 10);
    const failed = parseInt(rows[0]?.failed ?? '0', 10);
    const safeTotal = Number.isFinite(total) ? total : 0;
    const safeFailed = Number.isFinite(failed) ? failed : 0;
    return { total: safeTotal, failed: safeFailed, rate: safeTotal > 0 ? safeFailed / safeTotal : 0 };
  }

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

const DEFAULT_WEEKEND_HOUR_WEIGHTS: Record<string, number> = {
  '10': 0.4, '11': 0.7,
  '12': 1.0, '13': 1.1, '14': 0.9,
  '15': 0.8, '16': 0.8, '17': 0.9,
  '18': 1.2, '19': 1.5, '20': 1.7, '21': 1.5, '22': 1.0, '23': 0.5,
};

export function resolveGrowthDailyTarget(options: GrowthTargetOptions): number {
  const legacyTarget = sanitizeTarget(options.legacyTarget, 13);
  if (!options.growthEnabled) return legacyTarget;

  const weekend = isWeekendDay(options.baseDate.getDay());
  if (options.rampUpEnabled) {
    const rampWeek = getRampWeek(options.rampUpStartDate, options.baseDate);
    if (rampWeek === 0) {
      return Math.max(legacyTarget, sanitizeTarget(weekend ? options.week1WeekendTarget : options.week1WeekdayTarget, legacyTarget));
    }
    if (rampWeek === 1) {
      return Math.max(legacyTarget, sanitizeTarget(weekend ? options.week2WeekendTarget : options.week2WeekdayTarget, legacyTarget));
    }
  }

  return weekend
    ? pickTargetFromBand(options.weekendTargetMin, options.weekendTargetMax, options.baseDate, legacyTarget)
    : pickTargetFromBand(options.weekdayTargetMin, options.weekdayTargetMax, options.baseDate, legacyTarget);
}

export function reduceGrowthTargetForSafety(options: GrowthSafetyOptions): number {
  const target = sanitizeTarget(options.target, options.legacyTarget);
  if (!options.safetyEnabled) return target;

  const legacyTarget = sanitizeTarget(options.legacyTarget, 13);
  let safeTarget = target;

  if (options.authFailures >= Math.max(1, options.authFailureSoftLimit)) {
    safeTarget = Math.min(safeTarget, legacyTarget);
  }

  const enoughFailureSamples = options.postFailureSamples >= Math.max(1, options.postFailureMinSamples);
  if (enoughFailureSamples && options.postFailureRate >= options.postFailureRateThreshold) {
    const reduced = Math.floor(target * clamp(options.reductionFactor, 0.1, 1));
    safeTarget = Math.min(safeTarget, Math.max(legacyTarget, reduced));
  }

  return Math.max(0, safeTarget);
}

function isWeekendDay(day: number): boolean {
  return day === 0 || day === 6;
}

function getRampWeek(startDateRaw: string, baseDate: Date): number {
  const startMs = startDateRaw ? Date.parse(startDateRaw) : NaN;
  if (!Number.isFinite(startMs)) return 0;
  const elapsedMs = baseDate.getTime() - startMs;
  if (elapsedMs <= 0) return 0;
  return Math.floor(elapsedMs / (7 * 24 * 60 * 60 * 1000));
}

function pickTargetFromBand(min: number, max: number, baseDate: Date, fallback: number): number {
  const safeMin = sanitizeTarget(min, fallback);
  const safeMax = Math.max(safeMin, sanitizeTarget(max, safeMin));
  const span = safeMax - safeMin + 1;
  return safeMin + (baseDate.getDate() % span);
}

function sanitizeTarget(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : Math.floor(fallback);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

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
    .map((repo) => ({ repo, score: baseCandidateScore(repo, weights) }))
    .sort((a, b) => b.score - a.score);

  const topicCounts: Partial<Record<Topic, number>> = {};
  const ownerCounts = new Map<string, number>();

  return baseRanked.map(({ repo }) => {
    const topic = inferTopic(repo);
    const owner = repo.owner.toLowerCase();
    const rescored = baseCandidateScore(repo, weights, topicCounts, ownerCounts.get(owner) ?? 0);
    topicCounts[topic] = (topicCounts[topic] ?? 0) + 1;
    ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
    return { repo, score: rescored };
  }).sort((a, b) => b.score - a.score);
}

function baseCandidateScore(
  repo: TrendingRepo,
  weights: Record<string, number>,
  topicCounts: Partial<Record<Topic, number>> = {},
  recentOwnerCount = 0,
): number {
  if (repo.sourceType && repo.sourceType !== 'github' && typeof repo.sourceScore === 'number') {
    const noveltyPenalty = recentOwnerCount >= 3 ? (weights.noveltyOwnerRepeat ?? -5) : 0;
    const topicPenalty = Object.values(topicCounts).reduce((s, c) => s + (c ?? 0), 0) > 5
      ? (weights.noveltyTopicRepeat ?? -10)
      : 0;
    return Math.max(0, repo.sourceScore + noveltyPenalty + topicPenalty);
  }
  return scoreRepo(repo, weights, topicCounts, recentOwnerCount).total;
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
