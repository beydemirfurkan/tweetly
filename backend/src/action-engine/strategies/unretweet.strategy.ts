import { Injectable } from '@nestjs/common';
import { ACTION_TABLE_CONFIG, type ActionTableConfig } from '@persistence/repositories/action-repository';
import { EngagementActionStrategyBase } from './engagement-strategy.base';

@Injectable()
export class UnretweetActionStrategy extends EngagementActionStrategyBase {
  readonly type = 'unretweet' as const;
  readonly tableConfig: ActionTableConfig = ACTION_TABLE_CONFIG.unretweet;
  protected readonly snakePayload = true;

  protected keyFor(accountId: string, tweetId: string): string {
    return this.keys.forUnretweet(accountId, tweetId);
  }
}
