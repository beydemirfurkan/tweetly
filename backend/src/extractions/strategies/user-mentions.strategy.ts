import { Injectable } from '@nestjs/common';
import { XDirectReadService } from '@/x-automation/x-direct';
import { ExtractionStrategyBase } from './extraction-strategy.base';
import type { ExtractionFetchArgs } from './extraction-strategy.port';

@Injectable()
export class UserMentionsExtractionStrategy extends ExtractionStrategyBase {
  readonly type = 'user_mentions' as const;

  constructor(private readonly reads: XDirectReadService) {
    super();
  }

  fetch({ params, limit, accountId, cursor }: ExtractionFetchArgs) {
    return this.reads.getUserMentions(this.requireHandle(params), limit, accountId, cursor);
  }
}
