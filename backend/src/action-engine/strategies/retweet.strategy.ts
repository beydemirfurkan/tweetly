import { Injectable } from '@nestjs/common';
import { ACTION_TABLE_CONFIG, type ActionTableConfig } from '@persistence/repositories/action-repository';
import { EngagementActionStrategyBase } from './engagement-strategy.base';

@Injectable()
export class RetweetActionStrategy extends EngagementActionStrategyBase {
  readonly type = 'retweet' as const;
  readonly tableConfig: ActionTableConfig = ACTION_TABLE_CONFIG.retweet;

  protected keyFor(accountId: string, tweetId: string): string {
    return this.keys.forRetweet(accountId, tweetId);
  }
}
