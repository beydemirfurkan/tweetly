import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TimelineScraper, type ScrapedTweet } from './timeline-scraper.service';
import { ContentScorer, type ScoredTweet } from './content-scorer.service';
import { EngagementConfigService } from './engagement-config.service';
import { EngagementCounterService } from './engagement-counter.service';
import { ActionEnqueueService } from '../action-engine/action-enqueue.service';

const LIKE_THRESHOLD = 0.6;
const RETWEET_THRESHOLD = 0.8;
const LIKE_PROBABILITY = 0.4;
const RETWEET_PROBABILITY = 0.15;
const MAX_ENGAGEMENTS_PER_SCAN = 5;
const MAX_PER_AUTHOR_PER_DAY = 2;

@Injectable()
export class TimelineDiscoveryService {
  private readonly log = new Logger(TimelineDiscoveryService.name);

  constructor(
    private readonly scraper: TimelineScraper,
    private readonly scorer: ContentScorer,
    private readonly configService: EngagementConfigService,
    private readonly counter: EngagementCounterService,
    private readonly enqueue: ActionEnqueueService,
    private readonly dataSource: DataSource,
  ) {}

  async run(accountId: string, profileDir: string): Promise<{ scraped: number; scheduled: number }> {
    const config = await this.configService.get(accountId);
    if (!config.enabled || !config.timelineScrapeEnabled) {
      this.log.log(`Timeline discovery disabled for ${accountId}`);
      return { scraped: 0, scheduled: 0 };
    }

    if (!(await this.configService.isActiveHour(accountId))) {
      this.log.log(`Outside active hours for ${accountId}`);
      return { scraped: 0, scheduled: 0 };
    }

    const scraped = await this.scraper.scrape(accountId, profileDir);
    if (scraped.length === 0) return { scraped: 0, scheduled: 0 };

    const newTweets = await this.filterAlreadySeen(accountId, scraped);
    if (newTweets.length === 0) {
      this.log.log(`All ${scraped.length} tweets already seen`);
      return { scraped: scraped.length, scheduled: 0 };
    }

    const scored = await this.scorer.score(newTweets);
    const highRelevance = scored.filter((t) => t.relevanceScore >= LIKE_THRESHOLD);

    const scheduled = await this.scheduleEngagements(accountId, highRelevance, config);
    await this.saveDiscovered(accountId, scored);

    this.log.log(`Discovery complete: ${scraped.length} scraped, ${scheduled} engagements scheduled`);
    return { scraped: scraped.length, scheduled };
  }

  private async filterAlreadySeen(accountId: string, tweets: ScrapedTweet[]): Promise<ScrapedTweet[]> {
    const urls = tweets.map((t) => t.tweetUrl);
    const rows: Array<{ tweet_url: string }> = await this.dataSource.query(
      `SELECT tweet_url FROM discovered_tweets WHERE account_id = $1 AND tweet_url = ANY($2)`,
      [accountId, urls],
    );
    const seen = new Set(rows.map((r) => r.tweet_url));
    return tweets.filter((t) => !seen.has(t.tweetUrl));
  }

  private async scheduleEngagements(
    accountId: string,
    tweets: ScoredTweet[],
    config: Awaited<ReturnType<EngagementConfigService['get']>>,
  ): Promise<number> {
    let scheduled = 0;
    const authorCount = new Map<string, number>();

    const [likeLimit, retweetLimit, currentLikes, currentRetweets] = await Promise.all([
      config.maxLikesPerDay,
      config.maxRetweetsPerDay,
      this.counter.getDailyCount(accountId, 'like'),
      this.counter.getDailyCount(accountId, 'retweet'),
    ]);

    for (const tweet of tweets) {
      if (scheduled >= MAX_ENGAGEMENTS_PER_SCAN) break;

      const authorKey = tweet.authorHandle.toLowerCase();
      const authorEngagements = authorCount.get(authorKey) ?? 0;
      if (authorEngagements >= MAX_PER_AUTHOR_PER_DAY) continue;

      if (tweet.relevanceScore >= LIKE_THRESHOLD && currentLikes + scheduled < likeLimit) {
        if (Math.random() < LIKE_PROBABILITY) {
          await this.enqueueAction(accountId, tweet, 'like', config);
          scheduled++;
          authorCount.set(authorKey, authorEngagements + 1);
          continue;
        }
      }

      if (tweet.relevanceScore >= RETWEET_THRESHOLD && currentRetweets + scheduled < retweetLimit) {
        if (Math.random() < RETWEET_PROBABILITY) {
          await this.enqueueAction(accountId, tweet, 'retweet', config);
          scheduled++;
          authorCount.set(authorKey, authorEngagements + 1);
        }
      }
    }

    return scheduled;
  }

  private async enqueueAction(
    accountId: string,
    tweet: ScoredTweet,
    type: 'like' | 'retweet',
    config: Awaited<ReturnType<EngagementConfigService['get']>>,
  ): Promise<void> {
    const delay = config.minDelaySec + Math.random() * (config.maxDelaySec - config.minDelaySec);

    if (type === 'like') {
      await this.enqueue.enqueueLike({
        accountId,
        targetTweetUrl: tweet.tweetUrl,
        scheduledAt: new Date(Date.now() + delay * 1000),
        metadata: { source: 'timeline-discovery', author: tweet.authorHandle, score: tweet.relevanceScore },
      });
    } else {
      await this.enqueue.enqueueRetweet({
        accountId,
        targetTweetUrl: tweet.tweetUrl,
        scheduledAt: new Date(Date.now() + delay * 1000),
        metadata: { source: 'timeline-discovery', author: tweet.authorHandle, score: tweet.relevanceScore },
      });
    }
  }

  private async saveDiscovered(accountId: string, tweets: ScoredTweet[]): Promise<void> {
    if (tweets.length === 0) return;

    const values = tweets
      .map(
        (t) =>
          `('${accountId}', '${t.tweetUrl.replace(/'/g, "''")}', '${(t.authorHandle ?? '').replace(/'/g, "''")}', '${(t.contentText ?? '').slice(0, 500).replace(/'/g, "''")}', ${t.relevanceScore})`,
      )
      .join(', ');

    await this.dataSource.query(`
      INSERT INTO discovered_tweets (account_id, tweet_url, author_handle, content_text, relevance_score)
      VALUES ${values}
      ON CONFLICT (account_id, tweet_url) DO NOTHING
    `);
  }
}
