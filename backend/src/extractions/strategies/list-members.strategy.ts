import { Injectable } from '@nestjs/common';
import { XDirectReadService } from '@/x-automation/x-direct';
import { ExtractionStrategyBase } from './extraction-strategy.base';
import type { ExtractionFetchArgs } from './extraction-strategy.port';

@Injectable()
export class ListMembersExtractionStrategy extends ExtractionStrategyBase {
  readonly type = 'list_members' as const;

  constructor(private readonly reads: XDirectReadService) {
    super();
  }

  fetch({ params, limit, accountId, cursor }: ExtractionFetchArgs) {
    return this.reads.getListMembers(this.requireListId(params), limit, accountId, cursor, {
      verifiedOnly: params.verifiedOnly,
    });
  }
}
