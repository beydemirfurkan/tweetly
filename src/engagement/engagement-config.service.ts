import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface EngagementConfig {
  accountId: string;
  enabled: boolean;
  maxLikesPerDay: number;
  maxRetweetsPerDay: number;
  maxQuotesPerDay: number;
  maxBookmarksPerDay: number;
  activeHourStart: number;
  activeHourEnd: number;
  bookmarkOwnTweet: boolean;
  likeSourceTweet: boolean;
  retweetSourceTweet: boolean;
  timelineScrapeEnabled: boolean;
  timelineScrapeIntervalHours: number;
  minDelaySec: number;
  maxDelaySec: number;
}

const DEFAULT_CONFIG: Omit<EngagementConfig, 'accountId'> = {
  enabled: true,
  maxLikesPerDay: 15,
  maxRetweetsPerDay: 5,
  maxQuotesPerDay: 2,
  maxBookmarksPerDay: 8,
  activeHourStart: 9,
  activeHourEnd: 23,
  bookmarkOwnTweet: true,
  likeSourceTweet: false,
  retweetSourceTweet: false,
  timelineScrapeEnabled: false,
  timelineScrapeIntervalHours: 4,
  minDelaySec: 180,
  maxDelaySec: 1800,
};

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class EngagementConfigService {
  private readonly log = new Logger(EngagementConfigService.name);
  private readonly cache = new Map<string, { config: EngagementConfig; expiresAt: number }>();

  constructor(private readonly dataSource: DataSource) {}

  async get(accountId: string): Promise<EngagementConfig> {
    const cached = this.cache.get(accountId);
    if (cached && cached.expiresAt > Date.now()) return cached.config;

    const rows = await this.dataSource.query(
      'SELECT * FROM engagement_config WHERE account_id = $1',
      [accountId],
    );

    const config: EngagementConfig = rows[0]
      ? this.mapRow(rows[0])
      : { accountId, ...DEFAULT_CONFIG };

    this.cache.set(accountId, { config, expiresAt: Date.now() + CACHE_TTL_MS });
    return config;
  }

  async upsert(accountId: string, patch: Partial<EngagementConfig>): Promise<EngagementConfig> {
    const current = await this.get(accountId);
    const merged = { ...current, ...patch, accountId };

    const cols = [
      'enabled', 'max_likes_per_day', 'max_retweets_per_day', 'max_quotes_per_day',
      'max_bookmarks_per_day', 'active_hour_start', 'active_hour_end',
      'bookmark_own_tweet', 'like_source_tweet', 'retweet_source_tweet',
      'timeline_scrape_enabled', 'timeline_scrape_interval_hours',
      'min_delay_sec', 'max_delay_sec',
    ];
    const vals = [
      merged.enabled, merged.maxLikesPerDay, merged.maxRetweetsPerDay, merged.maxQuotesPerDay,
      merged.maxBookmarksPerDay, merged.activeHourStart, merged.activeHourEnd,
      merged.bookmarkOwnTweet, merged.likeSourceTweet, merged.retweetSourceTweet,
      merged.timelineScrapeEnabled, merged.timelineScrapeIntervalHours,
      merged.minDelaySec, merged.maxDelaySec,
    ];

    await this.dataSource.query(
      `INSERT INTO engagement_config (account_id, ${cols.join(', ')})
       VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (account_id) DO UPDATE SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now()`,
      [accountId, ...vals],
    );

    this.cache.delete(accountId);
    this.log.log(`Config updated for ${accountId}`);
    return merged;
  }

  async isActiveHour(accountId: string): Promise<boolean> {
    const cfg = await this.get(accountId);
    const hour = new Date().getHours();
    return hour >= cfg.activeHourStart && hour < cfg.activeHourEnd;
  }

  invalidateCache(accountId?: string): void {
    if (accountId) this.cache.delete(accountId);
    else this.cache.clear();
  }

  private mapRow(row: Record<string, unknown>): EngagementConfig {
    return {
      accountId: row.account_id as string,
      enabled: row.enabled as boolean,
      maxLikesPerDay: row.max_likes_per_day as number,
      maxRetweetsPerDay: row.max_retweets_per_day as number,
      maxQuotesPerDay: row.max_quotes_per_day as number,
      maxBookmarksPerDay: row.max_bookmarks_per_day as number,
      activeHourStart: row.active_hour_start as number,
      activeHourEnd: row.active_hour_end as number,
      bookmarkOwnTweet: row.bookmark_own_tweet as boolean,
      likeSourceTweet: row.like_source_tweet as boolean,
      retweetSourceTweet: row.retweet_source_tweet as boolean,
      timelineScrapeEnabled: row.timeline_scrape_enabled as boolean,
      timelineScrapeIntervalHours: row.timeline_scrape_interval_hours as number,
      minDelaySec: row.min_delay_sec as number,
      maxDelaySec: row.max_delay_sec as number,
    };
  }
}
