import { Injectable } from '@nestjs/common';
import { ACTION_TABLE_CONFIG, type ActionTableConfig } from '@persistence/repositories/action-repository';
import { EngagementActionStrategyBase } from './engagement-strategy.base';

@Injectable()
export class UnlikeActionStrategy extends EngagementActionStrategyBase {
  readonly type = 'unlike' as const;
  readonly tableConfig: ActionTableConfig = ACTION_TABLE_CONFIG.unlike;
  protected readonly snakePayload = true;

  protected keyFor(accountId: string, tweetId: string): string {
    return this.keys.forUnlike(accountId, tweetId);
  }
}
