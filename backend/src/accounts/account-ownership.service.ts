import { Injectable } from '@nestjs/common';
import { AccountsService } from './accounts.service';

export interface OwnershipNotFound {
  status: 'not_found';
  accountId: string;
}

export interface OwnershipOk {
  status: 'ok';
  accountId: string;
}

export type OwnershipCheck = OwnershipOk | OwnershipNotFound;

/**
 * Centralises the "does this account belong to this user?" question so
 * AccountFacade and McpService — which historically duplicated the same
 * findByIdForUser/listActiveForUser dance — share one implementation.
 * Caller decides how to surface failures (HTTP exception vs MCP error)
 * via the *OrThrow helpers.
 */
@Injectable()
export class AccountOwnershipService {
  constructor(private readonly accounts: AccountsService) {}

  async resolve(userId: string, candidate?: string): Promise<{ accountId: string | null; hadCandidate: boolean }> {
    if (candidate) {
      const acct = await this.accounts.findByIdForUser(candidate, userId);
      return { accountId: acct?.id ?? null, hadCandidate: true };
    }
    const active = await this.accounts.listActiveForUser(userId);
    return { accountId: active[0]?.id ?? null, hadCandidate: false };
  }

  async ownsAccount(userId: string, accountId: string): Promise<boolean> {
    const acct = await this.accounts.findByIdForUser(accountId, userId);
    return Boolean(acct);
  }

  async userAccountIds(userId: string): Promise<string[]> {
    const list = await this.accounts.listAllForUser(userId);
    return list.map((a) => a.id);
  }

  async userAccountIdSet(userId: string): Promise<Set<string>> {
    return new Set(await this.userAccountIds(userId));
  }
}
