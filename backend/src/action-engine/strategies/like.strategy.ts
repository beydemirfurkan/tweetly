import { Injectable } from '@nestjs/common';
import { ACTION_TABLE_CONFIG, type ActionTableConfig } from '@persistence/repositories/action-repository';
import { EngagementActionStrategyBase } from './engagement-strategy.base';

@Injectable()
export class LikeActionStrategy extends EngagementActionStrategyBase {
  readonly type = 'like' as const;
  readonly tableConfig: ActionTableConfig = ACTION_TABLE_CONFIG.like;

  protected keyFor(accountId: string, tweetId: string): string {
    return this.keys.forLike(accountId, tweetId);
  }
}
