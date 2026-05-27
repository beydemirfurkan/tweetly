import { Injectable } from '@nestjs/common';
import { ACTION_TABLE_CONFIG, type ActionTableConfig } from '@persistence/repositories/action-repository';
import { EngagementActionStrategyBase } from './engagement-strategy.base';

@Injectable()
export class BookmarkActionStrategy extends EngagementActionStrategyBase {
  readonly type = 'bookmark' as const;
  readonly tableConfig: ActionTableConfig = ACTION_TABLE_CONFIG.bookmark;

  protected keyFor(accountId: string, tweetId: string): string {
    return this.keys.forBookmark(accountId, tweetId);
  }
}
