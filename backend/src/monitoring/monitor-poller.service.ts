import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MonitoringService } from './monitoring.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookDeliveryHistoryService } from './webhook-delivery-history.service';
import { XDirectReadService } from '@/x-automation/x-direct';

const POLL_INTERVAL_MS = parseInt(process.env.MONITOR_POLL_INTERVAL_MS ?? '600000', 10); // 10 min default

// Stable 64-bit lock id (Postgres pg_try_advisory_lock takes a bigint).
// Any instance arrives at the same constant; collisions with unrelated
// callers in the same database are negligible.
const POLLER_LOCK_KEY = '8275634918273401';

@Injectable()
export class MonitorPollerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(MonitorPollerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly monitoring: MonitoringService,
    private readonly webhook: WebhookDeliveryService,
    private readonly deliveryHistory: WebhookDeliveryHistoryService,
    private readonly xDirect: XDirectReadService,
    private readonly dataSource: DataSource,
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
    let lockHeld = false;
    try {
      lockHeld = await this.tryAcquireLeaderLock();
      if (!lockHeld) {
        this.log.debug('Monitor poll skipped — another instance holds the leader lock');
        return;
      }
      const monitors = await this.monitoring.findEnabled();
      if (monitors.length === 0) return;
      this.log.log(`Polling ${monitors.length} monitor(s) (leader)`);

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
      if (lockHeld) {
        await this.releaseLeaderLock().catch((err) =>
          this.log.warn(`Lock release failed: ${err instanceof Error ? err.message : err}`),
        );
      }
      this.running = false;
    }
  }

  private async tryAcquireLeaderLock(): Promise<boolean> {
    // `MONITOR_LEADER_LOCK_DISABLED=true` is the explicit opt-out for test
    // mocks / non-Postgres deployments. In production we MUST NOT silently
    // treat a query failure as success — that turns a 30s DB hiccup into
    // duplicate webhook deliveries from every replica simultaneously.
    if (process.env.MONITOR_LEADER_LOCK_DISABLED === 'true') return true;
    try {
      const rows: Array<{ acquired: boolean }> = await this.dataSource.query(
        `SELECT pg_try_advisory_lock($1::bigint) AS acquired`,
        [POLLER_LOCK_KEY],
      );
      return rows[0]?.acquired === true;
    } catch (err) {
      // Real runtime error (DB outage, lost session). Skip this tick — the
      // next interval will retry. Better to miss one poll than fan out N
      // simultaneous webhook bursts to every customer's receiver.
      this.log.warn(`Advisory lock query failed: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }

  private async releaseLeaderLock(): Promise<void> {
    await this.dataSource.query(`SELECT pg_advisory_unlock($1::bigint)`, [POLLER_LOCK_KEY]);
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
    const { items: tweets } = await this.xDirect.getUserTweets(targetHandle, 1, accountId);

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
    await this.deliveryHistory.record(
      monitorId,
      'tweet.new',
      payload,
      result.ok ? 'delivered' : 'failed',
      result.error,
    );
  }
}
