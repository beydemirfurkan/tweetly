import type { ContentFormat, EngagementObjective } from '../types';
import { getFormatWeights, get } from '../storage/settings';
import { getFormatPerformance } from '../storage/analytics';
import { getFormatConfig, FORMATS } from '../ai/prompts';

export interface FormatSlot {
  format: ContentFormat;
  objective: EngagementObjective;
  isThread: boolean;
  threadCount: number;
}

interface MixRule {
  format: ContentFormat;
  weight: number;
}

function getAdaptiveWeights(): Record<string, number> {
  const baseWeights = getFormatWeights();
  const adaptiveEnabled = get<boolean>('format.adaptive.enabled', true);
  const minSamples = get<number>('format.adaptive.min_samples', 5);
  const boostFactor = get<number>('format.adaptive.boost_factor', 1.5);
  const cutFactor = get<number>('format.adaptive.cut_factor', 0.5);

  if (!adaptiveEnabled) return baseWeights;

  const last14d = new Date();
  last14d.setDate(last14d.getDate() - 14);
  const performance = getFormatPerformance(last14d);

  const perfMap = new Map(performance.map((p) => [p.format, p]));

  const adapted: Record<string, number> = {};
  for (const [format, baseWeight] of Object.entries(baseWeights)) {
    const perf = perfMap.get(format);
    if (!perf || perf.total < minSamples) {
      adapted[format] = baseWeight;
      continue;
    }

    let weight = baseWeight;
    if (perf.successRate >= 0.9) {
      weight = baseWeight * boostFactor;
    } else if (perf.successRate < 0.5) {
      weight = baseWeight * cutFactor;
    }

    adapted[format] = Math.max(0.5, weight);
  }

  return adapted;
}

function buildMixFromWeights(weights: Record<string, number>): MixRule[] {
  const rules: MixRule[] = [];
  for (const [format, weight] of Object.entries(weights)) {
    if (weight > 0) {
      rules.push({ format: format as ContentFormat, weight });
    }
  }
  return rules;
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function buildDailyMix(targetSlots: number, date: Date = new Date()): FormatSlot[] {
  const digestDay = get<number>('digest.day', 5);
  const threadDays = get<string>('thread.days', '1,3,5')
    .split(',')
    .map(Number)
    .filter((n) => Number.isFinite(n));

  const weights = getAdaptiveWeights();

  let mix: MixRule[];
  const day = date.getDay();

  if (day === digestDay) {
    mix = [
      { format: 'weekly_digest', weight: weights.weekly_digest ?? 1 },
      { format: 'no_link_hook', weight: weights.no_link_hook ?? 2 },
      { format: 'repo_drop', weight: weights.repo_drop ?? 1 },
      { format: 'question', weight: weights.question ?? 1 },
      { format: 'bookmark_bait', weight: weights.bookmark_bait ?? 1 },
    ];
  } else if (threadDays.includes(day)) {
    mix = buildMixFromWeights(weights);
    if (!mix.find((r) => r.format === 'mini_thread')) {
      mix.push({ format: 'mini_thread', weight: weights.mini_thread ?? 1 });
    }
  } else {
    mix = buildMixFromWeights(weights);
    mix = mix.filter((r) => r.format !== 'weekly_digest' && r.format !== 'mini_thread');
  }

  const totalWeight = mix.reduce((sum, r) => sum + r.weight, 0);

  const slots: FormatSlot[] = [];
  for (const rule of mix) {
    const count = Math.round((rule.weight / totalWeight) * targetSlots);
    const cfg = getFormatConfig(rule.format);
    for (let i = 0; i < count; i++) {
      slots.push({
        format: rule.format,
        objective: cfg.objective,
        isThread: cfg.isThread,
        threadCount: cfg.threadCount,
      });
    }
  }

  while (slots.length < targetSlots) {
    const fallback = mix[Math.floor(Math.random() * mix.length)];
    const cfg = getFormatConfig(fallback.format);
    slots.push({
      format: fallback.format,
      objective: cfg.objective,
      isThread: cfg.isThread,
      threadCount: cfg.threadCount,
    });
  }

  while (slots.length > targetSlots) {
    const removable = slots.findIndex(
      (s) => s.format !== 'no_link_hook' && s.format !== 'repo_drop'
    );
    if (removable >= 0) {
      slots.splice(removable, 1);
    } else {
      slots.pop();
    }
  }

  const linkSlots = slots.filter((s) => FORMATS[s.format].needsLink);
  const noLinkSlots = slots.filter((s) => !FORMATS[s.format].needsLink);
  return [...shuffleArray(linkSlots), ...shuffleArray(noLinkSlots)];
}

export function isDigestDay(date: Date = new Date()): boolean {
  const digestDay = get<number>('digest.day', 5);
  return date.getDay() === digestDay;
}
