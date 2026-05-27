import { Injectable } from '@nestjs/common';
import { ACTION_TABLE_CONFIG, type ActionTableConfig } from '@persistence/repositories/action-repository';
import { ProfileImageActionStrategyBase } from './profile-image-strategy.base';

@Injectable()
export class AvatarUpdateActionStrategy extends ProfileImageActionStrategyBase {
  readonly type = 'avatar_update' as const;
  readonly tableConfig: ActionTableConfig = ACTION_TABLE_CONFIG.avatar_update;

  protected keyFor(accountId: string, filePath: string): string {
    return this.keys.forAvatarUpdate(accountId, filePath);
  }
}
