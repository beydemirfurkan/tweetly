import { Injectable } from '@nestjs/common';
import { ACTION_TABLE_CONFIG, type ActionTableConfig } from '@persistence/repositories/action-repository';
import { EngagementActionStrategyBase } from './engagement-strategy.base';

@Injectable()
export class DeleteTweetActionStrategy extends EngagementActionStrategyBase {
  readonly type = 'delete_tweet' as const;
  readonly tableConfig: ActionTableConfig = ACTION_TABLE_CONFIG.delete_tweet;
  protected readonly snakePayload = true;

  protected keyFor(accountId: string, tweetId: string): string {
    return this.keys.forDeleteTweet(accountId, tweetId);
  }
}
