import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { XDirectService } from '../x-automation/x-direct.service';

const POLL_INTERVAL_MS = parseInt(process.env.MONITOR_POLL_INTERVAL_MS ?? '600000', 10); // 10 min default

@Injectable()
export class MonitorPollerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(MonitorPollerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly monitoring: MonitoringService,
    private readonly webhook: WebhookDeliveryService,
    private readonly xDirect: XDirectService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.MONITOR_POLLING_ENABLED === 'false') {
      this.log.log('Monitor polling disabled via MONITOR_POLLING_ENABLED=false');
      return;
    }
    this.log.log(`Monitor polling started, interval: ${POLL_INTERVAL_MS / 1000}s`);
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    // First poll after 30s startup delay
    setTimeout(() => this.poll(), 30_000);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const monitors = await this.monitoring.findEnabled();
      if (monitors.length === 0) return;
      this.log.log(`Polling ${monitors.length} monitor(s)`);

      for (const monitor of monitors) {
        try {
          await this.checkMonitor(
            monitor.id,
            monitor.accountId,
            monitor.targetHandle,
            monitor.webhookUrl,
            monitor.lastTweetUrl,
            monitor.eventTypes,
            monitor.webhookSecret,
          );
        } catch (err) {
          this.log.warn(`Monitor ${monitor.id} (${monitor.targetHandle}) poll error: ${err instanceof Error ? err.message : err}`);
          await this.monitoring.updateLastCheck(monitor.id).catch(() => null);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async checkMonitor(
    monitorId: string,
    accountId: string,
    targetHandle: string,
    webhookUrl: string,
    lastTweetUrl: string | null,
    eventTypes: string[],
    webhookSecret: string | null,
  ): Promise<void> {
    const tweets = await this.xDirect.getUserTweets(targetHandle, 1, accountId);

    if (tweets.length === 0) {
      await this.monitoring.updateLastCheck(monitorId);
      return;
    }

    const latestTweet = tweets[0];
    const latestUrl = latestTweet.url;

    if (!latestUrl || latestUrl === lastTweetUrl) {
      await this.monitoring.updateLastCheck(monitorId);
      return;
    }

    // New tweet detected
    this.log.log(`New tweet detected for @${targetHandle}: ${latestUrl}`);
    await this.monitoring.updateLastSeen(monitorId, latestUrl);

    if (!eventTypes.includes('tweet.new')) return;

    const payload = {
      event: 'tweet.new',
      monitor_id: monitorId,
      target_handle: targetHandle,
      tweet: {
        url: latestUrl,
        text: latestTweet.text,
        display_name: latestTweet.displayName,
        like_count: latestTweet.likeCount,
        retweet_count: latestTweet.retweetCount,
        reply_count: latestTweet.replyCount,
        posted_at: latestTweet.postedAt,
      },
      detected_at: new Date().toISOString(),
    };

    const result = await this.webhook.deliver(webhookUrl, payload, webhookSecret);
    await this.monitoring.recordDelivery(
      monitorId,
      'tweet.new',
      payload,
      result.ok ? 'delivered' : 'failed',
      result.error,
    );
  }
}
