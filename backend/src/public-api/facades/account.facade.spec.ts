import type { AccountsService } from '@/accounts/accounts.service';
import type { ProfileCacheService } from '@/accounts/profile-cache.service';
import type { AdminApiService } from '@/admin-api/admin-api.service';
import type { LoginJobsRepository } from '@/x-automation/login/login-jobs.repository';
import type { CredentialCipherService } from '@common/crypto/credential-cipher.service';
import { AccountFacade } from './account.facade';
import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';

function makeFacade(overrides: {
  loginJobs?: Partial<jest.Mocked<LoginJobsRepository>>;
  accounts?: Partial<jest.Mocked<AccountsService>>;
} = {}): {
  facade: AccountFacade;
  loginJobs: jest.Mocked<LoginJobsRepository>;
  accounts: jest.Mocked<AccountsService>;
} {
  const loginJobs = {
    create: jest.fn().mockResolvedValue({ id: 'job-1' }),
    findActiveCooldown: jest.fn().mockResolvedValue(null),
    findByIdForUser: jest.fn(),
    ...overrides.loginJobs,
  } as unknown as jest.Mocked<LoginJobsRepository>;
  const accounts = {
    findByIdForUser: jest.fn(),
    listActiveForUser: jest.fn().mockResolvedValue([]),
    listAllForUser: jest.fn().mockResolvedValue([]),
    ...overrides.accounts,
  } as unknown as jest.Mocked<AccountsService>;
  const cipher = {
    encrypt: jest.fn((v: string) => `enc:${v}`),
  } as unknown as CredentialCipherService;
  const cookieHealth = {
    check: jest.fn().mockResolvedValue({ ok: false, reason: 'missing_fields' }),
  } as unknown as import('@/x-automation/login/cookie-health-check.service').CookieHealthCheckService;
  const facade = new AccountFacade(
    accounts,
    {} as unknown as ProfileCacheService,
    {} as unknown as AdminApiService,
    loginJobs,
    cipher,
    cookieHealth,
  );
  return { facade, loginJobs, accounts };
}

describe('AccountFacade.createConnectJob', () => {
  it('queues a username-only job when email is omitted', async () => {
    const { facade, loginJobs } = makeFacade();
    const res = await facade.createConnectJob('user-1', {
      username: 'alice',
      password: 'secret',
    } as any);
    expect(res).toEqual({
      jobId: 'job-1',
      kind: 'connect',
      pollUrl: '/api/v1/accounts/login-jobs/job-1',
    });
    expect(loginJobs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        kind: 'connect',
        username: 'alice',
        email: null,
        encryptedPassword: 'enc:secret',
        encryptedTotpSecret: null,
      }),
    );
  });

  it('rejects malformed username', async () => {
    const { facade } = makeFacade();
    await expect(
      facade.createConnectJob('user-1', { username: '!!!', password: 'p' } as any),
    ).rejects.toThrow();
  });

  it('blocks when cooldown is active', async () => {
    const { facade } = makeFacade({
      loginJobs: {
        findActiveCooldown: jest.fn().mockResolvedValue({
          retryAfterSec: 60,
          retryAt: new Date(),
          failureCount: 3,
          manualReviewRequired: false,
        }),
      },
    });
    await expect(
      facade.createConnectJob('user-1', { username: 'alice', password: 'p' } as any),
    ).rejects.toThrow(HttpException);
  });
});

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
