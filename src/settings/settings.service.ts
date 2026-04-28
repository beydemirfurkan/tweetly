import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettingEntity } from '../persistence/entities/setting.entity';

type SettingType = 'string' | 'number' | 'boolean' | 'json';

interface SettingDef {
  key: string;
  defaultValue: unknown;
  type: SettingType;
}

const DEFS: SettingDef[] = [
  { key: 'tweets_per_day', defaultValue: 13, type: 'number' },
  { key: 'dispatch_interval_min', defaultValue: 45, type: 'number' },
  { key: 'dispatch_start_hour', defaultValue: 9, type: 'number' },
  { key: 'max_attempts', defaultValue: 3, type: 'number' },
  { key: 'min_repo_score', defaultValue: 40, type: 'number' },
  { key: 'reply_delay_ms', defaultValue: 10000, type: 'number' },
  { key: 'schedule_jitter_min', defaultValue: 15, type: 'number' },
  { key: 'schedule_jitter_max', defaultValue: 45, type: 'number' },
  {
    key: 'schedule.hour_weights',
    defaultValue: {
      '9': 0.3, '10': 0.4, '11': 0.6,
      '12': 1.0, '13': 1.0, '14': 0.9,
      '15': 0.6, '16': 0.6, '17': 0.7,
      '18': 0.9, '19': 1.4, '20': 1.5, '21': 1.3, '22': 0.8,
    },
    type: 'json',
  },
  { key: 'content_memory_max', defaultValue: 500, type: 'number' },
  { key: 'scoring.relevance.high', defaultValue: 20, type: 'number' },
  { key: 'scoring.relevance.tool', defaultValue: 10, type: 'number' },
  { key: 'scoring.popularity.high', defaultValue: 25, type: 'number' },
  { key: 'scoring.popularity.mid', defaultValue: 15, type: 'number' },
  { key: 'scoring.popularity.low', defaultValue: 5, type: 'number' },
  { key: 'scoring.trust.high_stars', defaultValue: 15, type: 'number' },
  { key: 'scoring.trust.mid_stars', defaultValue: 10, type: 'number' },
  { key: 'scoring.trust.verified_owner', defaultValue: 5, type: 'number' },
  { key: 'scoring.clarity.good', defaultValue: 10, type: 'number' },
  { key: 'scoring.clarity.no_desc', defaultValue: -20, type: 'number' },
  { key: 'scoring.clarity.generic', defaultValue: -10, type: 'number' },
  { key: 'scoring.freshness.high', defaultValue: 10, type: 'number' },
  { key: 'scoring.freshness.mid', defaultValue: 5, type: 'number' },
  { key: 'scoring.novelty.topic_repeat', defaultValue: -10, type: 'number' },
  { key: 'scoring.novelty.owner_repeat', defaultValue: -5, type: 'number' },
  { key: 'format.no_link_hook.weight', defaultValue: 3, type: 'number' },
  { key: 'format.repo_drop.weight', defaultValue: 2, type: 'number' },
  { key: 'format.question.weight', defaultValue: 2, type: 'number' },
  { key: 'format.comparison.weight', defaultValue: 1, type: 'number' },
  { key: 'format.bookmark_bait.weight', defaultValue: 1, type: 'number' },
  { key: 'format.hot_take.weight', defaultValue: 1, type: 'number' },
  { key: 'format.mini_thread.weight', defaultValue: 1, type: 'number' },
  { key: 'format.weekly_digest.weight', defaultValue: 1, type: 'number' },
  { key: 'format.repo_drop.link_as_reply', defaultValue: true, type: 'boolean' },
  { key: 'format.adaptive.enabled', defaultValue: true, type: 'boolean' },
  { key: 'format.adaptive.min_samples', defaultValue: 5, type: 'number' },
  { key: 'format.adaptive.boost_factor', defaultValue: 1.5, type: 'number' },
  { key: 'format.adaptive.cut_factor', defaultValue: 0.5, type: 'number' },
  { key: 'digest.day', defaultValue: 5, type: 'number' },
  { key: 'thread.days', defaultValue: '1,3,5', type: 'string' },
];

const CACHE_TTL_MS = 60_000;

@Injectable()
export class SettingsService {
  private readonly cache = new Map<string, { value: unknown; cachedAt: number }>();

  constructor(
    @InjectRepository(SettingEntity)
    private readonly repo: Repository<SettingEntity>,
  ) {}

  async get<T = unknown>(key: string, fallback?: T, accountId?: string): Promise<T> {
    const cacheKey = accountId ? `${accountId}:${key}` : key;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
      return cached.value as T;
    }

    let row: SettingEntity | null = null;
    if (accountId) {
      row = await this.repo.findOne({ where: { key, accountId } });
    }
    if (!row) {
      row = await this.repo.findOne({ where: { key, accountId: '' } });
    }

    if (!row) {
      const def = DEFS.find((d) => d.key === key);
      const value = def !== undefined ? def.defaultValue : fallback;
      return value as T;
    }

    const value = parseValue(row.value, row.type);
    this.cache.set(cacheKey, { value, cachedAt: now });
    return value as T;
  }

  async getScoringWeights(): Promise<Record<string, number>> {
    const keys: Array<[string, number]> = [
      ['scoring.relevance.high', 20],
      ['scoring.relevance.tool', 10],
      ['scoring.popularity.high', 25],
      ['scoring.popularity.mid', 15],
      ['scoring.popularity.low', 5],
      ['scoring.trust.high_stars', 15],
      ['scoring.trust.mid_stars', 10],
      ['scoring.trust.verified_owner', 5],
      ['scoring.clarity.good', 10],
      ['scoring.clarity.no_desc', -20],
      ['scoring.clarity.generic', -10],
      ['scoring.freshness.high', 10],
      ['scoring.freshness.mid', 5],
      ['scoring.novelty.topic_repeat', -10],
      ['scoring.novelty.owner_repeat', -5],
    ];
    const values = await Promise.all(keys.map(([k, d]) => this.get<number>(k, d)));
    return {
      relevanceHigh: values[0],
      relevanceTool: values[1],
      popularityHigh: values[2],
      popularityMid: values[3],
      popularityLow: values[4],
      trustHighStars: values[5],
      trustMidStars: values[6],
      trustVerifiedOwner: values[7],
      clarityGood: values[8],
      clarityNoDesc: values[9],
      clarityGeneric: values[10],
      freshnessHigh: values[11],
      freshnessMid: values[12],
      noveltyTopicRepeat: values[13],
      noveltyOwnerRepeat: values[14],
    };
  }

  async getFormatWeights(): Promise<Record<string, number>> {
    const keys: Array<[string, number, string]> = [
      ['format.no_link_hook.weight', 3, 'no_link_hook'],
      ['format.repo_drop.weight', 2, 'repo_drop'],
      ['format.question.weight', 2, 'question'],
      ['format.comparison.weight', 1, 'comparison'],
      ['format.bookmark_bait.weight', 1, 'bookmark_bait'],
      ['format.hot_take.weight', 1, 'hot_take'],
      ['format.mini_thread.weight', 1, 'mini_thread'],
      ['format.weekly_digest.weight', 1, 'weekly_digest'],
    ];
    const values = await Promise.all(keys.map(([k, d]) => this.get<number>(k, d)));
    return Object.fromEntries(keys.map(([, , name], i) => [name, values[i]]));
  }

  async getThreadDays(): Promise<number[]> {
    const raw = await this.get<string>('thread.days', '1,3,5');
    return raw.split(',').map(Number).filter((n) => Number.isFinite(n));
  }

  invalidateCache(key?: string, accountId?: string): void {
    if (!key) {
      this.cache.clear();
      return;
    }
    const cacheKey = accountId ? `${accountId}:${key}` : key;
    this.cache.delete(cacheKey);
  }
}

function parseValue(raw: string, type: string): unknown {
  switch (type) {
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
    case 'boolean':
      return raw === 'true' || raw === '1';
    case 'json':
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    default:
      return raw;
  }
}
