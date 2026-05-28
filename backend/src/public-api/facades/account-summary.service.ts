import { Injectable } from '@nestjs/common';
import { AccountsService } from '@/accounts/accounts.service';
import { ActionQueueService } from '@/action-engine/application/action-queue.service';

export interface AccountSummaryDto {
  accounts: {
    total: number;
    active: number;
    paused: number;
    banned: number;
  };
  queue: {
    byType: Array<{ type: string; pending: number; dead: number }>;
    totalPending: number;
    totalDead: number;
  };
  activity: {
    succeededLast24h: number;
  };
}

/**
 * Per-user dashboard rollup — account status breakdown + user-scoped queue
 * depth + 24h success count. Pulled out of AccountFacade so the facade is
 * not responsible for both lifecycle CRUD and analytics.
 */
@Injectable()
export class AccountSummaryService {
  constructor(
    private readonly accounts: AccountsService,
    private readonly queue: ActionQueueService,
  ) {}

  async getSummary(userId: string): Promise<AccountSummaryDto> {
    const userAccounts = await this.accounts.listAllForUser(userId);
    const accountIds = userAccounts.map((a) => a.id);
    const [queue, succeeded24h] = await Promise.all([
      this.queue.getQueueDepthForAccounts(accountIds),
      this.queue.getRecentSucceededCount(accountIds, 24 * 60 * 60 * 1000),
    ]);
    const totalPending = queue.reduce((s, q) => s + q.pending, 0);
    const totalDead = queue.reduce((s, q) => s + q.dead, 0);
    return {
      accounts: {
        total: userAccounts.length,
        active: userAccounts.filter((a) => a.status === 'active').length,
        paused: userAccounts.filter((a) => a.status === 'paused').length,
        banned: userAccounts.filter((a) => a.status === 'banned').length,
      },
      queue: { byType: queue, totalPending, totalDead },
      activity: { succeededLast24h: succeeded24h },
    };
  }
}
