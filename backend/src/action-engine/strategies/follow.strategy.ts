import { Injectable } from '@nestjs/common';
import { ACTION_TABLE_CONFIG, type ActionTableConfig } from '@persistence/repositories/action-repository';
import { FollowActionStrategyBase } from './follow-strategy.base';

@Injectable()
export class FollowActionStrategy extends FollowActionStrategyBase {
  readonly type = 'follow' as const;
  readonly tableConfig: ActionTableConfig = ACTION_TABLE_CONFIG.follow;

  protected keyFor(accountId: string, handle: string): string {
    return this.keys.forFollow(accountId, handle);
  }
}
