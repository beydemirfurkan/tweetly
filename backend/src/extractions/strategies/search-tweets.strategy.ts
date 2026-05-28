import { Injectable } from '@nestjs/common';
import { XDirectReadService } from '@/x-automation/x-direct';
import { ExtractionStrategyBase } from './extraction-strategy.base';
import type { ExtractionFetchArgs } from './extraction-strategy.port';

@Injectable()
export class SearchTweetsExtractionStrategy extends ExtractionStrategyBase {
  readonly type = 'search_tweets' as const;

  constructor(private readonly reads: XDirectReadService) {
    super();
  }

  fetch({ params, limit, accountId, cursor }: ExtractionFetchArgs) {
    return this.reads.searchTweets(this.requireQuery(params), limit, accountId, cursor);
  }
}
