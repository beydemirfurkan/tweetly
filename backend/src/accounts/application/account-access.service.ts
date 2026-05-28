import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountOwnershipService } from '../account-ownership.service';

@Injectable()
export class AccountAccessService {
  constructor(private readonly ownership: AccountOwnershipService) {}

  async resolveAccountId(userId: string, candidate?: string): Promise<string> {
    const resolved = await this.ownership.resolve(userId, candidate);
    if (resolved.hadCandidate && !resolved.accountId) {
      throw new NotFoundException(`Account ${candidate} not found`);
    }
    if (!resolved.accountId) {
      throw new BadRequestException('no active account; specify "account" or connect one');
    }
    return resolved.accountId;
  }

  async resolveAccountIdOptional(userId: string, candidate?: string): Promise<string | undefined> {
    if (!candidate) {
      const resolved = await this.ownership.resolve(userId);
      return resolved.accountId ?? undefined;
    }
    return this.resolveAccountId(userId, candidate);
  }

  async assertAccountOwnership(userId: string, accountId: string): Promise<void> {
    const ok = await this.ownership.ownsAccount(userId, accountId);
    if (!ok) throw new NotFoundException(`Account ${accountId} not found`);
  }

  userAccountIds(userId: string): Promise<string[]> {
    return this.ownership.userAccountIds(userId);
  }
}
