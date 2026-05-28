import { NotFoundException } from '@nestjs/common';
import { LoginHandler } from '../login.handler';
import { fakeContext } from './test-helpers';
import type { AccountsService } from '@/accounts/accounts.service';
import type { CredentialCipherService } from '@common/crypto/credential-cipher.service';
import type { LoginJobsRepository } from '@/x-automation/login/login-jobs.repository';

function build() {
  const accounts = {
    findByIdForUser: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<AccountsService>;

  const cipher = {
    encrypt: jest.fn((s: string) => `enc(${s})`),
  } as unknown as jest.Mocked<CredentialCipherService>;

  const loginJobs = {
    create: jest.fn().mockResolvedValue({ id: 'job-1' }),
    findByIdForUser: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<LoginJobsRepository>;

  return { handler: new LoginHandler(accounts, cipher, loginJobs), accounts, cipher, loginJobs };
}

describe('LoginHandler.connectXAccount', () => {
  it('rejects when password is missing', async () => {
    const { handler } = build();
    await expect(handler.connectXAccount({ username: 'u' }, fakeContext())).rejects.toThrow(/password/);
  });

  it('rejects an invalid base32 TOTP secret', async () => {
    const { handler } = build();
    await expect(
      handler.connectXAccount({ username: 'u', password: 'p', totp_secret: 'NOT_BASE32!@#' }, fakeContext()),
    ).rejects.toThrow();
  });

  it('honors the cooldown helper before creating a job', async () => {
    const cooldown = new Error('Login blocked after a recent failure. retry_after_sec=60');
    const ctx = fakeContext({ assertLoginCooldownIsClear: jest.fn().mockRejectedValue(cooldown) });
    const { handler, loginJobs } = build();

    await expect(handler.connectXAccount({ username: 'u', password: 'p' }, ctx)).rejects.toThrow(/cooldown|blocked/i);
    expect(loginJobs.create).not.toHaveBeenCalled();
  });

  it('encrypts the password and creates a connect job on success', async () => {
    const { handler, cipher, loginJobs } = build();

    const result = await handler.connectXAccount({ username: 'u', password: 'p' }, fakeContext());

    expect(cipher.encrypt).toHaveBeenCalledWith('p');
    expect(loginJobs.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'connect',
      username: 'u',
      encryptedPassword: 'enc(p)',
    }));
    expect(result).toMatchObject({ job_id: 'job-1', kind: 'connect' });
  });
});

describe('LoginHandler.reauthXAccount', () => {
  it('throws 404 when account does not belong to the user', async () => {
    const { handler } = build();
    await expect(
      handler.reauthXAccount({ account_id: 'a', password: 'p' }, fakeContext()),
    ).rejects.toThrow(NotFoundException);
  });

  it('reuses stored TOTP when none provided and the account opted in', async () => {
    const { handler, accounts, loginJobs } = build();
    accounts.findByIdForUser.mockResolvedValue({ id: 'a', totpSecretEncrypted: 'stored-totp' } as never);

    await handler.reauthXAccount({ account_id: 'a', password: 'p' }, fakeContext());

    expect(loginJobs.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'reauth',
      encryptedTotpSecret: 'stored-totp',
      // Stored secret means save_totp_secret should default true so future
      // reauths keep working without the user re-supplying it
      saveTotpSecret: true,
    }));
  });
});

describe('LoginHandler.getXLoginJob', () => {
  it('throws 404 when job not owned by the user', async () => {
    const { handler } = build();
    await expect(handler.getXLoginJob({ job_id: 'missing' }, fakeContext())).rejects.toThrow(NotFoundException);
  });

  it('returns a sanitized snapshot of an existing job', async () => {
    const { handler, loginJobs } = build();
    loginJobs.findByIdForUser.mockResolvedValue({
      id: 'job-1', kind: 'connect', status: 'success',
      targetAccountId: 'a', failureReason: null, failureDetail: null,
      createdAt: new Date(0), startedAt: null, finishedAt: null,
    } as never);

    const result = await handler.getXLoginJob({ job_id: 'job-1' }, fakeContext());

    expect(result).toMatchObject({ id: 'job-1', status: 'success', target_account_id: 'a' });
  });
});
