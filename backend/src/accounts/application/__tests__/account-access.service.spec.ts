import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountAccessService } from '../account-access.service';
import type { AccountOwnershipService } from '../../account-ownership.service';

function makeService(overrides: Partial<jest.Mocked<AccountOwnershipService>> = {}) {
  const ownership = {
    resolve: jest.fn().mockResolvedValue({ accountId: null, hadCandidate: false }),
    ownsAccount: jest.fn().mockResolvedValue(false),
    userAccountIds: jest.fn().mockResolvedValue([]),
    userAccountIdSet: jest.fn().mockResolvedValue(new Set()),
    ...overrides,
  } as unknown as jest.Mocked<AccountOwnershipService>;

  return { service: new AccountAccessService(ownership), ownership };
}

describe('AccountAccessService', () => {
  it('returns the resolved account id', async () => {
    const { service, ownership } = makeService({
      resolve: jest.fn().mockResolvedValue({ accountId: 'acc-1', hadCandidate: true }),
    });

    await expect(service.resolveAccountId('user-1', 'acc-1')).resolves.toBe('acc-1');
    expect(ownership.resolve).toHaveBeenCalledWith('user-1', 'acc-1');
  });

  it('throws NotFound when a requested account is not owned', async () => {
    const { service } = makeService({
      resolve: jest.fn().mockResolvedValue({ accountId: null, hadCandidate: true }),
    });

    await expect(service.resolveAccountId('user-1', 'foreign')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequest when no default active account exists', async () => {
    const { service } = makeService();

    await expect(service.resolveAccountId('user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows optional resolution to return undefined when no default exists', async () => {
    const { service } = makeService();

    await expect(service.resolveAccountIdOptional('user-1')).resolves.toBeUndefined();
  });
});
