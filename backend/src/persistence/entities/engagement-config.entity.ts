import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('engagement_config')
export class EngagementConfigEntity {
  @PrimaryColumn({ name: 'account_id', type: 'text' })
  accountId!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'max_likes_per_day', type: 'integer', default: 15 })
  maxLikesPerDay!: number;

  @Column({ name: 'max_retweets_per_day', type: 'integer', default: 5 })
  maxRetweetsPerDay!: number;

  @Column({ name: 'max_quotes_per_day', type: 'integer', default: 2 })
  maxQuotesPerDay!: number;

  @Column({ name: 'max_bookmarks_per_day', type: 'integer', default: 8 })
  maxBookmarksPerDay!: number;

  @Column({ name: 'active_hour_start', type: 'integer', default: 9 })
  activeHourStart!: number;

  @Column({ name: 'active_hour_end', type: 'integer', default: 23 })
  activeHourEnd!: number;

  @Column({ name: 'bookmark_own_tweet', type: 'boolean', default: true })
  bookmarkOwnTweet!: boolean;

  @Column({ name: 'like_source_tweet', type: 'boolean', default: false })
  likeSourceTweet!: boolean;

  @Column({ name: 'retweet_source_tweet', type: 'boolean', default: false })
  retweetSourceTweet!: boolean;

  @Column({ name: 'timeline_scrape_enabled', type: 'boolean', default: false })
  timelineScrapeEnabled!: boolean;

  @Column({ name: 'timeline_scrape_interval_hours', type: 'integer', default: 4 })
  timelineScrapeIntervalHours!: number;

  @Column({ name: 'min_delay_sec', type: 'integer', default: 180 })
  minDelaySec!: number;

  @Column({ name: 'max_delay_sec', type: 'integer', default: 1800 })
  maxDelaySec!: number;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
