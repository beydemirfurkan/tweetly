import { Injectable } from '@nestjs/common';
import { XDirectReadService } from '@/x-automation/x-direct';
import { ExtractionStrategyBase } from './extraction-strategy.base';
import type { ExtractionFetchArgs } from './extraction-strategy.port';

@Injectable()
export class UserFollowersExtractionStrategy extends ExtractionStrategyBase {
  readonly type = 'user_followers' as const;

  constructor(private readonly reads: XDirectReadService) {
    super();
  }

  fetch({ params, limit, accountId, cursor }: ExtractionFetchArgs) {
    return this.reads.getUserFollowers(this.requireHandle(params), limit, accountId, cursor, {
      verifiedOnly: params.verifiedOnly,
    });
  }
}
