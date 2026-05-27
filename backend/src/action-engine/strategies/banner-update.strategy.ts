import { Injectable } from '@nestjs/common';
import { ACTION_TABLE_CONFIG, type ActionTableConfig } from '@persistence/repositories/action-repository';
import { ProfileImageActionStrategyBase } from './profile-image-strategy.base';

@Injectable()
export class BannerUpdateActionStrategy extends ProfileImageActionStrategyBase {
  readonly type = 'banner_update' as const;
  readonly tableConfig: ActionTableConfig = ACTION_TABLE_CONFIG.banner_update;

  protected keyFor(accountId: string, filePath: string): string {
    return this.keys.forBannerUpdate(accountId, filePath);
  }
}
