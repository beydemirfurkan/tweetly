import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AccountsService } from '@/accounts/accounts.service';
import { AccountOwnershipService } from '@/accounts/account-ownership.service';
import type { ProfileCacheService } from '@/accounts/profile-cache.service';
import type { CookieHealthCheckService } from '@/x-automation/login/cookie-health-check.service';
import { AccountFacade } from '../account.facade';
import type { AccountSummaryService } from '../account-summary.service';

function makeFacade(overrides: {
  accounts?: Partial<jest.Mocked<AccountsService>>;
  cookieHealth?: Partial<jest.Mocked<CookieHealthCheckService>>;
} = {}): {
  facade: AccountFacade;
  accounts: jest.Mocked<AccountsService>;
  cookieHealth: jest.Mocked<CookieHealthCheckService>;
} {
  const accounts = {
    findByIdForUser: jest.fn(),
    listActiveForUser: jest.fn().mockResolvedValue([]),
    listAllForUser: jest.fn().mockResolvedValue([]),
    upsertAccount: jest.fn().mockResolvedValue({
      id: 'alice',
      displayName: 'alice',
      status: 'active',
      authToken: 'auth',
      authMulti: null,
      ct0: 'ct0',
      twid: 'twid',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      lastUsedAt: null,
    }),
    ...overrides.accounts,
  } as unknown as jest.Mocked<AccountsService>;
  const ownership = new AccountOwnershipService(accounts as unknown as AccountsService);
  const cookieHealth = {
    check: jest.fn().mockResolvedValue({ ok: false, reason: 'missing_fields' }),
    ...overrides.cookieHealth,
  } as unknown as jest.Mocked<CookieHealthCheckService>;
  const facade = new AccountFacade(
    accounts,
    ownership,
    {} as unknown as ProfileCacheService,
    {} as unknown as AccountSummaryService,
    cookieHealth,
  );
  return { facade, accounts, cookieHealth };
}

describe('AccountFacade.resolveAccountId', () => {
  it('returns the candidate when owned', async () => {
    const { facade, accounts } = makeFacade({
      accounts: { findByIdForUser: jest.fn().mockResolvedValue({ id: 'a1' }) },
    });
    expect(await facade.resolveAccountId('u1', 'a1')).toBe('a1');
    expect(accounts.findByIdForUser).toHaveBeenCalledWith('a1', 'u1');
  });

  it('falls back to first active account when no candidate', async () => {
    const { facade } = makeFacade({
      accounts: { listActiveForUser: jest.fn().mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]) },
    });
    expect(await facade.resolveAccountId('u1')).toBe('b1');
  });

  it('throws BadRequest when no active account exists', async () => {
    const { facade } = makeFacade();
    await expect(facade.resolveAccountId('u1')).rejects.toThrow(BadRequestException);
  });

  it('throws NotFound when candidate is not owned', async () => {
    const { facade } = makeFacade({
      accounts: { findByIdForUser: jest.fn().mockResolvedValue(null) },
    });
    await expect(facade.resolveAccountId('u1', 'foreign')).rejects.toThrow(NotFoundException);
  });
});

describe('AccountFacade.upsertAccount', () => {
  it('validates pasted cookies before saving them', async () => {
    const { facade, accounts, cookieHealth } = makeFacade({
      cookieHealth: {
        check: jest.fn().mockResolvedValue({ ok: true, screenName: 'Alice' }),
      },
    });

    await facade.upsertAccount('user-1', 'alice', {
      authToken: ' auth ',
      ct0: ' ct0 ',
      twid: 'twid',
    });

    expect(cookieHealth.check).toHaveBeenCalledWith({
      authToken: 'auth',
      ct0: 'ct0',
      twid: 'twid',
    });
    expect(accounts.upsertAccount).toHaveBeenCalled();
  });

  it('rejects pasted cookies for a different X account', async () => {
    const { facade, accounts } = makeFacade({
      cookieHealth: {
        check: jest.fn().mockResolvedValue({ ok: true, screenName: 'bob' }),
      },
    });

    await expect(
      facade.upsertAccount('user-1', 'alice', {
        authToken: 'auth',
        ct0: 'ct0',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(accounts.upsertAccount).not.toHaveBeenCalled();
  });

  it('rejects invalid pasted cookies before saving', async () => {
    const { facade, accounts } = makeFacade({
      cookieHealth: {
        check: jest.fn().mockResolvedValue({
          ok: false,
          reason: 'rejected_by_x',
          detail: 'X rejected the session',
        }),
      },
    });

    await expect(
      facade.upsertAccount('user-1', 'alice', {
        authToken: 'auth',
        ct0: 'ct0',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(accounts.upsertAccount).not.toHaveBeenCalled();
  });

  it('validates partial cookie updates with existing stored cookies', async () => {
    const { facade, cookieHealth } = makeFacade({
      accounts: {
        findByIdForUser: jest.fn().mockResolvedValue({
          id: 'alice',
          userId: 'user-1',
          authToken: 'old-auth',
          ct0: 'existing-ct0',
          twid: 'existing-twid',
        }),
      },
      cookieHealth: {
        check: jest.fn().mockResolvedValue({ ok: true, screenName: 'alice' }),
      },
    });

    await facade.upsertAccount('user-1', 'alice', { authToken: 'new-auth' });

    expect(cookieHealth.check).toHaveBeenCalledWith({
      authToken: 'new-auth',
      ct0: 'existing-ct0',
      twid: 'existing-twid',
    });
  });
});
