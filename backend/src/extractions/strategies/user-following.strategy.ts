import { Injectable } from '@nestjs/common';
import { XDirectReadService } from '@/x-automation/x-direct';
import { ExtractionStrategyBase } from './extraction-strategy.base';
import type { ExtractionFetchArgs } from './extraction-strategy.port';

@Injectable()
export class UserFollowingExtractionStrategy extends ExtractionStrategyBase {
  readonly type = 'user_following' as const;

  constructor(private readonly reads: XDirectReadService) {
    super();
  }

  fetch({ params, limit, accountId, cursor }: ExtractionFetchArgs) {
    return this.reads.getUserFollowing(this.requireHandle(params), limit, accountId, cursor, {
      verifiedOnly: params.verifiedOnly,
    });
  }
}
