import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActionEnqueueService } from '../action-engine/action-enqueue.service';

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
  ) {}

  async onPostSucceeded(params: PostSucceededPayload): Promise<void> {
    const { actionId, accountId, tweetUrl, metadata } = params;

    if (metadata.engagement_scheduled) return;

    const scheduled: string[] = [];

    try {
      await this.enqueue.enqueueBookmark({
        accountId,
        targetTweetUrl: tweetUrl,
        scheduledAt: this.randomDelay(2, 8),
        metadata: { source: 'post-action-hook', parent_action_id: actionId },
      });
      scheduled.push('bookmark');
    } catch (err) {
      this.log.warn(`Bookmark schedule failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (scheduled.length > 0) {
      await this.dataSource.query(
        `UPDATE post_actions SET metadata = metadata || '{"engagement_scheduled": true}'::jsonb WHERE id = $1`,
        [actionId],
      );
      this.log.log(`Post-action engagement: ${scheduled.join(', ')} for ${tweetUrl}`);
    }
  }

  private randomDelay(minMin: number, maxMin: number): Date {
    return new Date(Date.now() + minMin * 60_000 + Math.random() * (maxMin - minMin) * 60_000);
  }
}
