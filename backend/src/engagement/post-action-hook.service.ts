import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActionEnqueueService } from '../action-engine/action-enqueue.service';
import { EngagementConfigService } from './engagement-config.service';
import { EngagementCounterService } from './engagement-counter.service';

export interface PostSucceededPayload {
  actionId: string;
  accountId: string;
  tweetId: string;
  tweetUrl: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class PostActionHook {
  private readonly log = new Logger(PostActionHook.name);

  constructor(
    private readonly enqueue: ActionEnqueueService,
    private readonly dataSource: DataSource,
    private readonly configService: EngagementConfigService,
    private readonly counter: EngagementCounterService,
  ) {}

  async onPostSucceeded(params: PostSucceededPayload): Promise<void> {
    const { actionId, accountId, tweetUrl, metadata } = params;

    if (metadata.engagement_scheduled) return;

    const config = await this.configService.get(accountId);
    if (!config.enabled) return;

    if (!(await this.configService.isActiveHour(accountId))) {
      this.log.log(`Outside active hours for ${accountId}, skipping post-action hook`);
      return;
    }

    const scheduled: string[] = [];

    if (config.bookmarkOwnTweet) {
      const withinLimit = await this.counter.withinDailyLimit(accountId, 'bookmark', config.maxBookmarksPerDay);
      if (withinLimit) {
        try {
          await this.enqueue.enqueueBookmark({
            accountId,
            targetTweetUrl: tweetUrl,
            scheduledAt: this.randomDelay(config.minDelaySec, config.maxDelaySec),
            metadata: { source: 'post-action-hook', parent_action_id: actionId },
          });
          scheduled.push('bookmark');
        } catch (err) {
          this.log.warn(`Bookmark schedule failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        this.log.log(`Bookmark daily limit reached for ${accountId}`);
      }
    }

    if (scheduled.length > 0) {
      await this.dataSource.query(
        `UPDATE post_actions SET metadata = metadata || '{"engagement_scheduled": true}'::jsonb WHERE id = $1`,
        [actionId],
      );
      this.log.log(`Post-action: ${scheduled.join(', ')} for ${tweetUrl}`);
    }
  }

  private randomDelay(minSec: number, maxSec: number): Date {
    const sec = minSec + Math.random() * (maxSec - minSec);
    return new Date(Date.now() + sec * 1000);
  }
}
