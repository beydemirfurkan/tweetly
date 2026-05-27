import { Injectable } from '@nestjs/common';
import { ACTION_TABLE_CONFIG, type ActionTableConfig } from '@persistence/repositories/action-repository';
import { FollowActionStrategyBase } from './follow-strategy.base';

@Injectable()
export class UnfollowActionStrategy extends FollowActionStrategyBase {
  readonly type = 'unfollow' as const;
  readonly tableConfig: ActionTableConfig = ACTION_TABLE_CONFIG.unfollow;
  protected readonly snakePayload = true;

  protected keyFor(accountId: string, handle: string): string {
    return this.keys.forUnfollow(accountId, handle);
  }
}
