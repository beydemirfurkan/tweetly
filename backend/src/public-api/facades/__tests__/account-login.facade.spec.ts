import { HttpException, NotFoundException } from '@nestjs/common';
import type { AccountsService } from '@/accounts/accounts.service';
import type { LoginJobsRepository } from '@/x-automation/login/login-jobs.repository';
import type { CredentialCipherService } from '@common/crypto/credential-cipher.service';
import { AccountLoginFacade } from '../account-login.facade';

function makeFacade(overrides: {
  loginJobs?: Partial<jest.Mocked<LoginJobsRepository>>;
  accounts?: Partial<jest.Mocked<AccountsService>>;
} = {}): {
  facade: AccountLoginFacade;
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
    ...overrides.accounts,
  } as unknown as jest.Mocked<AccountsService>;
  const cipher = {
    encrypt: jest.fn((v: string) => `enc:${v}`),
  } as unknown as CredentialCipherService;
  const facade = new AccountLoginFacade(accounts, loginJobs, cipher);
  return { facade, loginJobs, accounts };
}

describe('AccountLoginFacade.createConnectJob', () => {
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

describe('AccountLoginFacade.createReauthJob', () => {
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

describe('AccountLoginFacade.cancelLoginJob', () => {
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
