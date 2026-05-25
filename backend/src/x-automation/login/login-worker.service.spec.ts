import {
  LoginWorker,
  chooseFallbackProxyCountry,
  isTransientFailure,
  shouldRetryWithFallbackProxy,
} from './login-worker.service';
import type { ClaimedJob, LoginJobsRepository } from './login-jobs.repository';
import type { XLoginService } from './x-login.service';
import type { CredentialCipherService } from '@common/crypto/credential-cipher.service';
import type { AccountsService } from '@/accounts/accounts.service';
import type { DataSource, EntityManager } from 'typeorm';
import type { XLoginResult } from './login.types';

function makeJob(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: 'job-1',
    userId: 'user-1',
    kind: 'connect',
    targetAccountId: null,
    username: 'alice',
    email: 'alice@example.com',
    encryptedPassword: 'enc:pw',
    encryptedTotpSecret: null,
    saveTotpSecret: false,
    proxyCountry: null,
    ...overrides,
  };
}

function successResult(screenName = 'alice'): XLoginResult {
  return {
    ok: true,
    screenName,
    userId: '12345',
    cookies: { authToken: 'AT', ct0: 'C0', twid: 'u%3D12345' },
    durationMs: 1234,
  };
}

interface MockManager {
  query: jest.Mock;
}

function makeWorker(opts: {
  loginResult: XLoginResult | XLoginResult[] | Error;
  cipherDecrypt?: jest.Mock;
  existingAccount?: Array<{ id: string; user_id: string; status: string; totp_secret_encrypted: string | null; proxy_country: string | null }>;
  findActiveCooldown?: jest.Mock;
}): {
  worker: LoginWorker;
  jobs: jest.Mocked<LoginJobsRepository>;
  login: jest.Mocked<XLoginService>;
  accounts: jest.Mocked<AccountsService>;
  manager: MockManager;
} {
  const jobs = {
    markFailure: jest.fn().mockResolvedValue(undefined),
    markSuccess: jest.fn().mockResolvedValue(undefined),
    markCancelled: jest.fn().mockResolvedValue(undefined),
    isCancelled: jest.fn().mockResolvedValue(false),
    extendLock: jest.fn().mockResolvedValue(undefined),
    resetStaleRunningJobs: jest.fn().mockResolvedValue(0),
    findActiveCooldown: opts.findActiveCooldown ?? jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<LoginJobsRepository>;

  const cipher = {
    decrypt: opts.cipherDecrypt ?? jest.fn((blob: string) => `decrypted:${blob}`),
    encrypt: jest.fn((plain: string) => `v1:enc(${plain})`),
  } as unknown as jest.Mocked<CredentialCipherService>;

  const loginResults = Array.isArray(opts.loginResult) ? [...opts.loginResult] : [opts.loginResult];
  const login = {
    run: jest.fn(async (): Promise<XLoginResult> => {
      const result = loginResults.shift();
      if (result instanceof Error) throw result;
      if (!result) throw new Error('missing mocked login result');
      return result;
    }),
  } as unknown as jest.Mocked<XLoginService>;

  const accounts = {
    recordSessionSuccess: jest.fn().mockResolvedValue(undefined),
    recordSessionFailure: jest.fn().mockResolvedValue(0),
  } as unknown as jest.Mocked<AccountsService>;

  const manager: MockManager = {
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM accounts WHERE id')) {
        return Promise.resolve(opts.existingAccount ?? []);
      }
      return Promise.resolve([]);
    }),
  };

  const dataSource = {
    transaction: jest.fn(async (fn: (m: EntityManager) => Promise<unknown>) => fn(manager as unknown as EntityManager)),
  } as unknown as DataSource;

  const profileCache = {
    refreshInBackground: jest.fn(),
  };

  const worker = new LoginWorker(dataSource, jobs, login, cipher, accounts, profileCache as any);
  return { worker, jobs, login, accounts, manager };
}

describe('LoginWorker.process', () => {
  it('process() schedules a heartbeat that calls extendLock periodically and stops on completion', async () => {
    jest.useFakeTimers();
    try {
      const { worker, jobs } = makeWorker({ loginResult: successResult() });
      // Make login.run hang until we advance timers so the heartbeat fires.
      let resolveLogin: (() => void) | null = null;
      (worker as any).login = {
        run: jest.fn(async () => {
          await new Promise<void>((resolve) => {
            resolveLogin = resolve;
          });
          return successResult();
        }),
      };

      const p = worker.process(makeJob());
      // Advance past the heartbeat interval (TTL/3 = 100s at default lockTtl).
      // Two firings prove the interval is repeating, not a one-shot setTimeout.
      jest.advanceTimersByTime(120_000);
      jest.advanceTimersByTime(120_000);
      resolveLogin!();
      await p;

      // process() finished → heartbeat must be cleared (jobs.extendLock is
      // called for our job id and never after process resolves).
      expect((jobs.extendLock as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
      for (const call of (jobs.extendLock as jest.Mock).mock.calls) {
        expect(call[0]).toBe('job-1');
      }
    } finally {
      jest.useRealTimers();
    }
  });

  it('marks failure with detail when password decryption fails', async () => {
    const cipherDecrypt = jest.fn().mockImplementation(() => {
      throw new Error('boom');
    });
    const { worker, jobs } = makeWorker({
      loginResult: successResult(),
      cipherDecrypt,
    });
    await worker.process(makeJob());
    expect(jobs.markFailure).toHaveBeenCalledWith('job-1', 'unknown', expect.stringContaining('cipher error'));
    expect(jobs.markSuccess).not.toHaveBeenCalled();
  });

  it('connect failure → markFailure with reason from XLogin', async () => {
    const { worker, jobs, accounts } = makeWorker({
      loginResult: { ok: false, reason: 'invalid_credentials', detail: 'password rejected', durationMs: 500 },
    });
    await worker.process(makeJob());
    expect(jobs.markFailure).toHaveBeenCalledWith('job-1', 'invalid_credentials', 'password rejected');
    expect(accounts.recordSessionFailure).not.toHaveBeenCalled();
  });

  it('reauth failure → also bumps session failure on target account', async () => {
    const { worker, jobs, accounts } = makeWorker({
      loginResult: { ok: false, reason: 'login_cooldown', detail: 'too many attempts', durationMs: 200 },
    });
    await worker.process(makeJob({ kind: 'reauth', targetAccountId: 'alice' }));
    expect(jobs.markFailure).toHaveBeenCalledWith('job-1', 'login_cooldown', 'too many attempts');
    expect(accounts.recordSessionFailure).toHaveBeenCalledWith('alice', expect.stringContaining('login_cooldown'));
  });

  it('connect success → INSERTs new account + markSuccess + records healthy', async () => {
    const { worker, jobs, accounts, manager } = makeWorker({
      loginResult: successResult('Alice'),
      existingAccount: [],
    });
    await worker.process(makeJob());

    const insertCall = manager.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO accounts'));
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual(
      expect.arrayContaining(['alice', 'user-1', 'Alice', 'v1:enc(AT)', 'v1:enc(C0)', 'v1:enc(u%3D12345)']),
    );
    expect(jobs.markSuccess).toHaveBeenCalledWith('job-1', { targetAccountId: 'alice', keepEncryptedTotp: false });
    expect(accounts.recordSessionSuccess).toHaveBeenCalledWith('alice');
  });

  it('reauth success with matching target → UPDATE and clear paused status', async () => {
    const { worker, jobs, manager } = makeWorker({
      loginResult: successResult('alice'),
      existingAccount: [
        { id: 'alice', user_id: 'user-1', status: 'paused', totp_secret_encrypted: null, proxy_country: null },
      ],
    });
    await worker.process(makeJob({ kind: 'reauth', targetAccountId: 'alice' }));

    const updateCall = manager.query.mock.calls.find(([sql]) => sql.includes('UPDATE accounts'));
    expect(updateCall).toBeDefined();
    // status hard-coded to 'active' in the SET clause
    expect(updateCall![0]).toMatch(/status\s*=\s*'active'/);
    expect(jobs.markSuccess).toHaveBeenCalled();
  });

  it('reauth success but logged-in handle differs → invalid_credentials failure', async () => {
    const { worker, jobs } = makeWorker({
      loginResult: successResult('mallory'),
      existingAccount: [
        { id: 'alice', user_id: 'user-1', status: 'active', totp_secret_encrypted: null, proxy_country: null },
      ],
    });
    await worker.process(makeJob({ kind: 'reauth', targetAccountId: 'alice' }));
    expect(jobs.markFailure).toHaveBeenCalledWith(
      'job-1',
      'invalid_credentials',
      expect.stringContaining('logged in as=mallory'),
    );
    expect(jobs.markSuccess).not.toHaveBeenCalled();
  });

  it('saveTotpSecret=true and totp provided → keepEncryptedTotp passes through', async () => {
    const { worker, jobs } = makeWorker({
      loginResult: successResult('alice'),
      existingAccount: [],
    });
    await worker.process(
      makeJob({ encryptedTotpSecret: 'enc:totp', saveTotpSecret: true }),
    );
    expect(jobs.markSuccess).toHaveBeenCalledWith('job-1', { targetAccountId: 'alice', keepEncryptedTotp: true });
  });

  it('rejects rebinding an account owned by another user', async () => {
    const { worker, jobs } = makeWorker({
      loginResult: successResult('alice'),
      existingAccount: [
        { id: 'alice', user_id: 'someone-else', status: 'active', totp_secret_encrypted: null, proxy_country: null },
      ],
    });
    // Transaction throws → process() lets it propagate; tick() handles it
    // by marking the job failed (covered separately at integration level).
    await expect(worker.process(makeJob())).rejects.toThrow(/another user/);
    expect(jobs.markSuccess).not.toHaveBeenCalled();
  });

  it('retries policy-shaped egress failures with a configured fallback proxy', async () => {
    const previousProxy = process.env.LOGIN_PROXY_US;
    const previousFallbacks = process.env.LOGIN_FALLBACK_PROXY_COUNTRIES;
    process.env.LOGIN_PROXY_US = 'http://us.proxy.example:9000';
    process.env.LOGIN_FALLBACK_PROXY_COUNTRIES = 'US';
    try {
      const { worker, jobs, login } = makeWorker({
        loginResult: [
          {
            ok: false,
            // home_not_reached is the canonical "X served the login page but
            // we never got to /home" case where rotating egress legitimately
            // helps; login_cooldown is now explicitly excluded.
            reason: 'home_not_reached',
            detail: 'password field never appeared',
            durationMs: 100,
          },
          successResult('alice'),
        ],
        existingAccount: [],
      });

      await worker.process(makeJob());

      expect(login.run).toHaveBeenNthCalledWith(2, expect.objectContaining({ proxyCountry: 'US' }));
      expect(jobs.markSuccess).toHaveBeenCalledWith('job-1', { targetAccountId: 'alice', keepEncryptedTotp: false });
    } finally {
      if (previousProxy === undefined) delete process.env.LOGIN_PROXY_US;
      else process.env.LOGIN_PROXY_US = previousProxy;
      if (previousFallbacks === undefined) delete process.env.LOGIN_FALLBACK_PROXY_COUNTRIES;
      else process.env.LOGIN_FALLBACK_PROXY_COUNTRIES = previousFallbacks;
    }
  });

  it('does NOT retry with a proxy fallback when reason is login_cooldown', async () => {
    const previousProxy = process.env.LOGIN_PROXY_US;
    const previousFallbacks = process.env.LOGIN_FALLBACK_PROXY_COUNTRIES;
    process.env.LOGIN_PROXY_US = 'http://us.proxy.example:9000';
    process.env.LOGIN_FALLBACK_PROXY_COUNTRIES = 'US';
    try {
      const { worker, jobs, login } = makeWorker({
        loginResult: {
          ok: false,
          reason: 'login_cooldown',
          detail: 'X onboarding rejected login temporarily; try again later',
          durationMs: 100,
        },
      });

      await worker.process(makeJob());

      expect(login.run).toHaveBeenCalledTimes(1);
      expect(jobs.markFailure).toHaveBeenCalledWith('job-1', 'login_cooldown', expect.stringContaining('try again later'));
    } finally {
      if (previousProxy === undefined) delete process.env.LOGIN_PROXY_US;
      else process.env.LOGIN_PROXY_US = previousProxy;
      if (previousFallbacks === undefined) delete process.env.LOGIN_FALLBACK_PROXY_COUNTRIES;
      else process.env.LOGIN_FALLBACK_PROXY_COUNTRIES = previousFallbacks;
    }
  });

  it('skips the transient retry when findActiveCooldown returns an active cooldown', async () => {
    const { worker, jobs, login } = makeWorker({
      loginResult: [
        { ok: false, reason: 'unknown', detail: 'step navigate: net::ERR_TIMED_OUT', durationMs: 30000 },
      ],
      findActiveCooldown: jest.fn().mockResolvedValue({
        username: 'alice',
        failureCount: 2,
        retryAfterSec: 1500,
        retryAt: new Date(Date.now() + 1500_000).toISOString(),
        manualReviewRequired: false,
      }),
    });

    await worker.process(makeJob());

    // login.run fired once (the original attempt); the transient retry was
    // skipped because the cooldown gate said "no".
    expect(login.run).toHaveBeenCalledTimes(1);
    expect(jobs.findActiveCooldown).toHaveBeenCalledWith('user-1', 'alice');
    expect(jobs.markFailure).toHaveBeenCalled();
  });

  it('skips the proxy fallback retry when findActiveCooldown trips between attempts', async () => {
    const previousProxy = process.env.LOGIN_PROXY_US;
    const previousFallbacks = process.env.LOGIN_FALLBACK_PROXY_COUNTRIES;
    process.env.LOGIN_PROXY_US = 'http://us.proxy.example:9000';
    process.env.LOGIN_FALLBACK_PROXY_COUNTRIES = 'US';
    try {
      const { worker, jobs, login } = makeWorker({
        loginResult: {
          ok: false,
          reason: 'home_not_reached',
          detail: 'password field never appeared',
          durationMs: 100,
        },
        findActiveCooldown: jest.fn().mockResolvedValue({
          username: 'alice',
          failureCount: 3,
          retryAfterSec: 3600,
          retryAt: new Date(Date.now() + 3600_000).toISOString(),
          manualReviewRequired: true,
        }),
      });

      await worker.process(makeJob());

      expect(login.run).toHaveBeenCalledTimes(1);
      expect(jobs.markFailure).toHaveBeenCalledWith('job-1', 'home_not_reached', expect.any(String));
    } finally {
      if (previousProxy === undefined) delete process.env.LOGIN_PROXY_US;
      else process.env.LOGIN_PROXY_US = previousProxy;
      if (previousFallbacks === undefined) delete process.env.LOGIN_FALLBACK_PROXY_COUNTRIES;
      else process.env.LOGIN_FALLBACK_PROXY_COUNTRIES = previousFallbacks;
    }
  });
});

describe('isTransientFailure', () => {
  const fail = (reason: Extract<XLoginResult, { ok: false }>['reason'], detail: string) => ({
    ok: false as const,
    reason,
    detail,
    durationMs: 0,
  });

  it('matches Patchright navigation timeout', () => {
    expect(isTransientFailure(fail('unknown', 'step navigate: navigation timeout 45000ms exceeded'))).toBe(true);
  });

  it('matches chromium net errors', () => {
    expect(isTransientFailure(fail('unknown', 'step navigate: net::ERR_TIMED_OUT at https://x.com/'))).toBe(true);
  });

  it('matches X retryable login error page text', () => {
    expect(
      isTransientFailure(
        fail('unknown', 'step username: timeout body~Bir sorun oluştu. Yeniden yüklemeyi dene.'),
      ),
    ).toBe(true);
  });

  it('matches socket errors', () => {
    expect(isTransientFailure(fail('unknown', 'fetch failed: ECONNRESET'))).toBe(true);
  });

  it('does not retry user-side failures', () => {
    expect(isTransientFailure(fail('invalid_credentials', 'password rejected'))).toBe(false);
    expect(isTransientFailure(fail('captcha_required', 'arkose iframe visible'))).toBe(false);
  });

  it('does not retry an unknown reason whose detail is non-transient', () => {
    expect(isTransientFailure(fail('unknown', 'step username: locator timeout 20000ms exceeded'))).toBe(false);
  });
});

describe('fallback proxy helpers', () => {
  const fail = (reason: Extract<XLoginResult, { ok: false }>['reason'], detail: string) => ({
    ok: false as const,
    reason,
    detail,
    durationMs: 0,
  });

  it('chooses a configured fallback proxy country different from the current one', () => {
    const previousProxy = process.env.LOGIN_PROXY_US;
    const previousFallbacks = process.env.LOGIN_FALLBACK_PROXY_COUNTRIES;
    process.env.LOGIN_PROXY_US = 'http://us.proxy.example:9000';
    process.env.LOGIN_FALLBACK_PROXY_COUNTRIES = 'US';
    try {
      expect(chooseFallbackProxyCountry(null)).toBe('US');
      expect(chooseFallbackProxyCountry('us')).toBeNull();
    } finally {
      if (previousProxy === undefined) delete process.env.LOGIN_PROXY_US;
      else process.env.LOGIN_PROXY_US = previousProxy;
      if (previousFallbacks === undefined) delete process.env.LOGIN_FALLBACK_PROXY_COUNTRIES;
      else process.env.LOGIN_FALLBACK_PROXY_COUNTRIES = previousFallbacks;
    }
  });

  it('does not choose an unconfigured fallback proxy country', () => {
    const previousProxy = process.env.LOGIN_PROXY_US;
    const previousFallbacks = process.env.LOGIN_FALLBACK_PROXY_COUNTRIES;
    delete process.env.LOGIN_PROXY_US;
    process.env.LOGIN_FALLBACK_PROXY_COUNTRIES = 'US';
    try {
      expect(chooseFallbackProxyCountry(null)).toBeNull();
    } finally {
      if (previousProxy === undefined) delete process.env.LOGIN_PROXY_US;
      else process.env.LOGIN_PROXY_US = previousProxy;
      if (previousFallbacks === undefined) delete process.env.LOGIN_FALLBACK_PROXY_COUNTRIES;
      else process.env.LOGIN_FALLBACK_PROXY_COUNTRIES = previousFallbacks;
    }
  });

  it('retries only egress-shaped policy failures with fallback proxy', () => {
    // login_cooldown is an account-level signal — changing egress IP doesn't
    // lift the limit and signals more strongly to X's anti-abuse. Always skip.
    expect(
      shouldRetryWithFallbackProxy(
        fail('login_cooldown', 'X onboarding rejected login temporarily; try again later'),
      ),
    ).toBe(false);
    expect(
      shouldRetryWithFallbackProxy(fail('home_not_reached', 'username step did not advance. url=https://x.com/i/flow/login')),
    ).toBe(true);
    expect(
      shouldRetryWithFallbackProxy(fail('home_not_reached', 'retryable login page before username input after 3 attempts')),
    ).toBe(true);
    expect(shouldRetryWithFallbackProxy(fail('invalid_credentials', 'password rejected'))).toBe(false);
    expect(shouldRetryWithFallbackProxy(fail('captcha_required', 'arkose iframe visible'))).toBe(false);
  });
});

describe('LoginWorker cancellation', () => {
  it("XLogin returns reason='cancelled' → worker calls markCancelled instead of markFailure", async () => {
    const { worker, jobs, accounts } = makeWorker({
      loginResult: { ok: false, reason: 'cancelled', detail: 'login cancelled by user', durationMs: 800 },
    });
    await worker.process(makeJob());
    expect(jobs.markCancelled).toHaveBeenCalledWith('job-1', 'login cancelled by user');
    expect(jobs.markFailure).not.toHaveBeenCalled();
    // Cancelled jobs are not failures from X's POV — the session-failure
    // counter on the account row must NOT be bumped even for reauth kind.
    expect(accounts.recordSessionFailure).not.toHaveBeenCalled();
  });

  it('reauth cancellation skips session-failure bump on the target account', async () => {
    const { worker, jobs, accounts } = makeWorker({
      loginResult: { ok: false, reason: 'cancelled', detail: 'login aborted (shutdown signal)', durationMs: 1500 },
    });
    await worker.process(makeJob({ kind: 'reauth', targetAccountId: 'alice' }));
    expect(jobs.markCancelled).toHaveBeenCalledWith('job-1', 'login aborted (shutdown signal)');
    expect(accounts.recordSessionFailure).not.toHaveBeenCalled();
  });

  it('forwards isCancelled probe + AbortSignal into XLogin so the service can poll cancel between steps', async () => {
    const { worker, login } = makeWorker({ loginResult: successResult() });
    await worker.process(makeJob());
    const arg = (login.run as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(typeof arg.isCancelled).toBe('function');
    expect(arg.signal).toBeInstanceOf(AbortSignal);
  });

  it('worker isCancelled probe queries the repository for the live cancel state', async () => {
    const { worker, jobs, login } = makeWorker({ loginResult: successResult() });
    (jobs.isCancelled as jest.Mock).mockResolvedValueOnce(true);
    await worker.process(makeJob());
    const arg = (login.run as jest.Mock).mock.calls[0][0] as { isCancelled: () => Promise<boolean> };
    await expect(arg.isCancelled()).resolves.toBe(true);
    expect(jobs.isCancelled).toHaveBeenCalledWith('job-1');
  });
});
