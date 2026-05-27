import { AccountHandler } from '../account.handler';
import { fakeContext } from '../__tests__/test-helpers';
import { NotFoundException } from '@nestjs/common';
import type { AccountsService } from '@/accounts/accounts.service';
import type { AdminApiService } from '@/admin-api/admin-api.service';
import type { SettingsService } from '@/settings/settings.service';
import type { CredentialCipherService } from '@common/crypto/credential-cipher.service';
import type { LoginJobsRepository } from '@/x-automation/login/login-jobs.repository';
import type { DataSource } from 'typeorm';

function mocks() {
  const accounts = {
    listAllForUser: jest.fn().mockResolvedValue([]),
    listActiveForUser: jest.fn().mockResolvedValue([]),
    findByIdForUser: jest.fn().mockResolvedValue(null),
    getSessionHealth: jest.fn().mockResolvedValue({ paused: false }),
  } as unknown as jest.Mocked<AccountsService>;

  const adminApi = {
    listActions: jest.fn().mockResolvedValue([]),
    cancelAction: jest.fn().mockResolvedValue(true),
    replayAction: jest.fn().mockResolvedValue(true),
    findActionAccountId: jest.fn().mockResolvedValue('acc-1'),
  } as unknown as jest.Mocked<AdminApiService>;

  const settings = {
    getDefs: jest.fn().mockReturnValue([{ key: 'foo', defaultValue: 'bar', type: 'string' }]),
    get: jest.fn().mockResolvedValue('val'),
    invalidateCache: jest.fn(),
  } as unknown as jest.Mocked<SettingsService>;

  const cipher = {
    encrypt: jest.fn((s: string) => `enc(${s})`),
  } as unknown as jest.Mocked<CredentialCipherService>;

  const loginJobs = {
    create: jest.fn().mockResolvedValue({ id: 'job-1' }),
    findByIdForUser: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<LoginJobsRepository>;

  const upsert = jest.fn().mockResolvedValue(undefined);
  const dataSource = {
    getRepository: jest.fn().mockReturnValue({ upsert }),
  } as unknown as jest.Mocked<DataSource>;

  return { accounts, adminApi, settings, cipher, loginJobs, dataSource, upsert };
}

function build(overrides: Partial<ReturnType<typeof mocks>> = {}) {
  const m = { ...mocks(), ...overrides };
  return {
    handler: new AccountHandler(m.accounts, m.adminApi, m.settings, m.cipher, m.loginJobs, m.dataSource),
    ...m,
  };
}

describe('AccountHandler', () => {
  describe('getAccounts', () => {
    it('returns the accounts list with stripped/derived fields', async () => {
      const { handler, accounts } = build();
      accounts.listAllForUser.mockResolvedValue([
        { id: 'a', displayName: 'A', status: 'active', authToken: 'tok', createdAt: new Date(0), lastUsedAt: null } as never,
      ]);

      const result = await handler.getAccounts({}, fakeContext());

      expect(result.count).toBe(1);
      expect(result.accounts[0]).toMatchObject({ id: 'a', hasAuthToken: true, status: 'active' });
      // Sensitive fields like authToken itself should NOT leak
      expect((result.accounts[0] as Record<string, unknown>).authToken).toBeUndefined();
    });
  });

  describe('connectXAccount', () => {
    it('rejects when password is missing', async () => {
      const { handler } = build();
      await expect(
        handler.connectXAccount({ username: 'u' }, fakeContext()),
      ).rejects.toThrow(/password/);
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

  describe('reauthXAccount', () => {
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

  describe('getXLoginJob', () => {
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

  describe('listActions', () => {
    it('throws on unknown action type', async () => {
      const { handler } = build();
      await expect(handler.listActions({ type: 'bogus' }, fakeContext())).rejects.toThrow(/type must be one of/);
    });

    it('returns empty rows when the user has no accounts (defensive)', async () => {
      const ctx = fakeContext({ userAccountIdSet: jest.fn().mockResolvedValue(new Set()) });
      const { handler } = build();
      const result = await handler.listActions({ type: 'post' }, ctx);
      expect(result).toEqual({ type: 'post', count: 0, rows: [] });
    });

    it('blocks queries against accounts the user does not own', async () => {
      const ctx = fakeContext({ userAccountIdSet: jest.fn().mockResolvedValue(new Set(['acc-1'])) });
      const { handler } = build();
      await expect(handler.listActions({ type: 'post', account_id: 'foreign' }, ctx)).rejects.toThrow(/foreign/);
    });

    it('filters rows by allowedIds when no account_id is given', async () => {
      const { handler, adminApi } = build();
      adminApi.listActions.mockResolvedValue([
        { id: 'r1', account_id: 'acc-1' },
        { id: 'r2', account_id: 'foreign' },
      ] as never);
      const ctx = fakeContext({ userAccountIdSet: jest.fn().mockResolvedValue(new Set(['acc-1'])) });

      const result = await handler.listActions({ type: 'post' }, ctx);

      expect(result.count).toBe(1);
      expect(result.rows[0].id).toBe('r1');
    });
  });

  describe('cancelAction / replayAction', () => {
    it('cancelAction asserts ownership before mutating', async () => {
      const ctx = fakeContext({
        assertActionOwnership: jest.fn().mockRejectedValue(new NotFoundException('Action a not found')),
      });
      const { handler, adminApi } = build();

      await expect(handler.cancelAction({ type: 'post', action_id: 'a' }, ctx)).rejects.toThrow(NotFoundException);
      expect(adminApi.cancelAction).not.toHaveBeenCalled();
    });

    it('replayAction returns ok+pending on success', async () => {
      const { handler } = build();
      const result = await handler.replayAction({ type: 'post', action_id: 'a' }, fakeContext());
      expect(result).toEqual({ ok: true, id: 'a', status: 'pending' });
    });
  });

  describe('getSettings / updateSettings', () => {
    it('getSettings requires account_id', async () => {
      const { handler } = build();
      await expect(handler.getSettings({}, fakeContext())).rejects.toThrow(/account_id/);
    });

    it('getSettings returns a key→value map for the account', async () => {
      const { handler } = build();
      const result = await handler.getSettings({ account_id: 'acc-1' }, fakeContext());
      expect(result).toEqual({ foo: 'val' });
    });

    it('updateSettings rejects non-object payload', async () => {
      const { handler } = build();
      await expect(
        handler.updateSettings({ account_id: 'acc-1', settings: 'not-an-object' }, fakeContext()),
      ).rejects.toThrow(/settings must be an object/);
    });

    it('updateSettings stores allowlisted keys with their declared types', async () => {
      const { handler, upsert, settings } = build();
      settings.getDefs.mockReturnValue([
        { key: 's', defaultValue: '', type: 'string' },
        { key: 'n', defaultValue: 0, type: 'number' },
        { key: 'b', defaultValue: false, type: 'boolean' },
        { key: 'j', defaultValue: {}, type: 'json' },
      ]);

      const result = await handler.updateSettings(
        { account_id: 'acc-1', settings: { s: 'hi', n: 42, b: true, j: { k: 1 } } },
        fakeContext(),
      );

      expect(upsert).toHaveBeenCalledTimes(4);
      expect(upsert.mock.calls[0][0]).toMatchObject({ key: 's', type: 'string', value: 'hi' });
      expect(upsert.mock.calls[1][0]).toMatchObject({ key: 'n', type: 'number', value: '42' });
      expect(upsert.mock.calls[2][0]).toMatchObject({ key: 'b', type: 'boolean', value: 'true' });
      expect(upsert.mock.calls[3][0]).toMatchObject({ key: 'j', type: 'json', value: '{"k":1}' });
      expect(settings.invalidateCache).toHaveBeenCalled();
      expect(result).toEqual({ ok: true, updated: 4 });
    });

    it('updateSettings rejects unknown keys without writing them', async () => {
      const { handler, upsert } = build();

      await expect(
        handler.updateSettings(
          { account_id: 'acc-1', settings: { 'secrets.admin_token': 'x' } },
          fakeContext(),
        ),
      ).rejects.toThrow(/Unknown setting: secrets\.admin_token/);

      expect(upsert).not.toHaveBeenCalled();
    });

    it('updateSettings validates all keys before writing any rows', async () => {
      const { handler, settings, upsert } = build();
      settings.getDefs.mockReturnValue([{ key: 'max_attempts', defaultValue: 3, type: 'number' }]);

      await expect(
        handler.updateSettings(
          { account_id: 'acc-1', settings: { max_attempts: 5, 'secrets.admin_token': 'x' } },
          fakeContext(),
        ),
      ).rejects.toThrow(/Unknown setting: secrets\.admin_token/);

      expect(upsert).not.toHaveBeenCalled();
    });

    it('updateSettings rejects values that do not match the setting type', async () => {
      const { handler, settings, upsert } = build();
      settings.getDefs.mockReturnValue([{ key: 'max_attempts', defaultValue: 3, type: 'number' }]);

      await expect(
        handler.updateSettings(
          { account_id: 'acc-1', settings: { max_attempts: 'many' } },
          fakeContext(),
        ),
      ).rejects.toThrow(/max_attempts must be number/);

      expect(upsert).not.toHaveBeenCalled();
    });
  });
});
