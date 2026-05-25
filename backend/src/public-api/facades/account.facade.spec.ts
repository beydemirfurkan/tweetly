import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import type { AccountsService } from '@/accounts/accounts.service';
import type { ProfileCacheService } from '@/accounts/profile-cache.service';
import type { AdminApiService } from '@/admin-api/admin-api.service';
import type { LoginJobsRepository } from '@/x-automation/login/login-jobs.repository';
import type { CookieHealthCheckService } from '@/x-automation/login/cookie-health-check.service';
import type { CredentialCipherService } from '@common/crypto/credential-cipher.service';
import { AccountFacade } from './account.facade';

function makeFacade(overrides: {
  loginJobs?: Partial<jest.Mocked<LoginJobsRepository>>;
  accounts?: Partial<jest.Mocked<AccountsService>>;
  cookieHealth?: Partial<jest.Mocked<CookieHealthCheckService>>;
} = {}): {
  facade: AccountFacade;
  loginJobs: jest.Mocked<LoginJobsRepository>;
  accounts: jest.Mocked<AccountsService>;
  cookieHealth: jest.Mocked<CookieHealthCheckService>;
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
  const cipher = {
    encrypt: jest.fn((v: string) => `enc:${v}`),
  } as unknown as CredentialCipherService;
  const cookieHealth = {
    check: jest.fn().mockResolvedValue({ ok: false, reason: 'missing_fields' }),
    ...overrides.cookieHealth,
  } as unknown as jest.Mocked<CookieHealthCheckService>;
  const facade = new AccountFacade(
    accounts,
    {} as unknown as ProfileCacheService,
    {} as unknown as AdminApiService,
    loginJobs,
    cipher,
    cookieHealth,
  );
  return { facade, loginJobs, accounts, cookieHealth };
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
        proxyCountry: null,
      }),
    );
  });

  it('normalizes an explicit proxy country on connect jobs', async () => {
    const { facade, loginJobs } = makeFacade();

    await facade.createConnectJob('user-1', {
      username: 'alice',
      password: 'secret',
      proxyCountry: 'tr',
    } as any);

    expect(loginJobs.create).toHaveBeenCalledWith(expect.objectContaining({ proxyCountry: 'TR' }));
  });

  it('uses LOGIN_DEFAULT_PROXY_COUNTRY when connect omits proxyCountry', async () => {
    const previous = process.env.LOGIN_DEFAULT_PROXY_COUNTRY;
    process.env.LOGIN_DEFAULT_PROXY_COUNTRY = 'US';
    try {
      const { facade, loginJobs } = makeFacade();

      await facade.createConnectJob('user-1', { username: 'alice', password: 'secret' } as any);

      expect(loginJobs.create).toHaveBeenCalledWith(expect.objectContaining({ proxyCountry: 'US' }));
    } finally {
      if (previous === undefined) delete process.env.LOGIN_DEFAULT_PROXY_COUNTRY;
      else process.env.LOGIN_DEFAULT_PROXY_COUNTRY = previous;
    }
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

describe('AccountFacade.createReauthJob', () => {
  it('reuses the stored account proxy country when body omits proxyCountry', async () => {
    const { facade, loginJobs } = makeFacade({
      accounts: {
        findByIdForUser: jest.fn().mockResolvedValue({
          id: 'alice',
          totpSecretEncrypted: null,
          proxyCountry: 'DE',
        }),
      },
    });

    await facade.createReauthJob('user-1', 'Alice', { password: 'secret' } as any);

    expect(loginJobs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'reauth',
        targetAccountId: 'alice',
        username: 'alice',
        proxyCountry: 'DE',
      }),
    );
  });

  it('lets reauth body override the stored proxy country', async () => {
    const { facade, loginJobs } = makeFacade({
      accounts: {
        findByIdForUser: jest.fn().mockResolvedValue({
          id: 'alice',
          totpSecretEncrypted: null,
          proxyCountry: 'DE',
        }),
      },
    });

    await facade.createReauthJob('user-1', 'alice', {
      password: 'secret',
      proxyCountry: 'us',
    } as any);

    expect(loginJobs.create).toHaveBeenCalledWith(expect.objectContaining({ proxyCountry: 'US' }));
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

describe('AccountFacade.cancelLoginJob', () => {
  it('returns priorStatus on a successful cancel', async () => {
    const { facade, loginJobs } = makeFacade({
      loginJobs: {
        cancelForUser: jest.fn().mockResolvedValue({ priorStatus: 'queued' }),
      },
    });
    const res = await facade.cancelLoginJob('user-1', 'job-1');
    expect(res).toEqual({ ok: true, status: 'cancelled', priorStatus: 'queued' });
    expect(loginJobs.cancelForUser).toHaveBeenCalledWith('job-1', 'user-1');
  });

  it('throws NotFound when the row does not exist or belongs to another user', async () => {
    const { facade } = makeFacade({
      loginJobs: {
        cancelForUser: jest.fn().mockResolvedValue({ reason: 'not_found' }),
      },
    });
    await expect(facade.cancelLoginJob('user-1', 'job-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws 409 ConflictException when the row is already terminal', async () => {
    const { facade } = makeFacade({
      loginJobs: {
        cancelForUser: jest.fn().mockResolvedValue({ reason: 'already_terminal' }),
      },
    });
    await expect(facade.cancelLoginJob('user-1', 'job-1')).rejects.toMatchObject({
      status: 409,
    });
    // Specifically an HttpException (not just any rejection)
    await expect(facade.cancelLoginJob('user-1', 'job-1')).rejects.toBeInstanceOf(HttpException);
  });
});
