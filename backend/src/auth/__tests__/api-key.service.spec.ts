import { ApiKeyService } from './api-key.service';
import type { ApiKeyEntity } from '@persistence/entities/api-key.entity';
import { mockRepository } from '@/test/mocks/repository.mock';

function createService() {
  const repo = mockRepository<ApiKeyEntity>();
  const service = new ApiKeyService(repo as any);
  return { service, repo };
}

describe('ApiKeyService', () => {
  describe('create()', () => {
    it('returns a tk_-prefixed key and persists hash + prefix', async () => {
      const { service, repo } = createService();
      (repo.create as jest.Mock).mockImplementation((input: any) => input);
      repo.save = jest.fn().mockImplementation(async (entity: any) => ({ ...entity, id: 'k-1' }));

      const result = await service.create({ userId: 'user-1', name: 'Test key' });

      expect(result.plainKey.startsWith('tk_')).toBe(true);
      expect(result.plainKey.length).toBeGreaterThan(60);
      expect(result.prefix).toBe(result.plainKey.slice(0, 11));
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          name: 'Test key',
          keyPrefix: result.prefix,
        }),
      );
      const saved = (repo.save as jest.Mock).mock.calls[0][0];
      expect(saved.keyHash).not.toBe(result.plainKey);
      expect(saved.keyHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('defaults scopes to ["*"] when not provided', async () => {
      const { service, repo } = createService();
      (repo.create as jest.Mock).mockImplementation((input: any) => input);
      repo.save = jest.fn().mockImplementation(async (entity: any) => entity);

      await service.create({ userId: 'u', name: 'k' });

      const saved = (repo.save as jest.Mock).mock.calls[0][0];
      expect(saved.scopes).toEqual(['*']);
    });
  });

  describe('verify()', () => {
    it('returns null for tokens missing the prefix', async () => {
      const { service } = createService();
      const row = await service.verify('not-a-key');
      expect(row).toBeNull();
    });

    it('returns null when hash not in DB', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue(null);
      const row = await service.verify('tk_abc');
      expect(row).toBeNull();
    });

    it('returns null when expired', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue({
        id: 'k',
        userId: 'u',
        expiresAt: new Date(Date.now() - 60_000),
        revokedAt: null,
      } as ApiKeyEntity);
      const row = await service.verify('tk_abc');
      expect(row).toBeNull();
    });

    it('returns row when found, active, unexpired', async () => {
      const { service, repo } = createService();
      const row = {
        id: 'k',
        userId: 'u',
        expiresAt: null,
        revokedAt: null,
      } as ApiKeyEntity;
      repo.findOne.mockResolvedValue(row);
      const result = await service.verify('tk_abc');
      expect(result).toBe(row);
    });
  });

  describe('issueOAuthKey()', () => {
    it('revokes existing active key for (userId, oauthClientId) before issuing', async () => {
      const { service, repo } = createService();
      const updateSpy = jest.fn().mockResolvedValue({ affected: 1 });
      repo.update = updateSpy;
      (repo.create as jest.Mock).mockImplementation((input: any) => input);
      repo.save = jest.fn().mockImplementation(async (e: any) => ({ ...e, id: 'k-new' }));

      await service.issueOAuthKey({
        userId: 'u-1',
        oauthClientId: 'oauth_xyz',
        clientName: 'Claude Desktop',
      });

      expect(updateSpy).toHaveBeenCalledTimes(1);
      const [whereArg, setArg] = updateSpy.mock.calls[0];
      expect(whereArg.userId).toBe('u-1');
      expect(whereArg.oauthClientId).toBe('oauth_xyz');
      expect(setArg.revokedAt).toBeInstanceOf(Date);

      const saved = (repo.save as jest.Mock).mock.calls[0][0];
      expect(saved.issuedVia).toBe('oauth');
      expect(saved.oauthClientId).toBe('oauth_xyz');
      expect(saved.scopes).toEqual(['*']);
      expect(saved.name).toBe('Claude Desktop');
    });
  });

  describe('revokeByPlainKey()', () => {
    it('returns false for tokens missing prefix', async () => {
      const { service } = createService();
      expect(await service.revokeByPlainKey('not-a-key')).toBe(false);
    });

    it('updates with hashed key when prefix valid', async () => {
      const { service, repo } = createService();
      repo.update = jest.fn().mockResolvedValue({ affected: 1 });
      const ok = await service.revokeByPlainKey('tk_abc123');
      expect(ok).toBe(true);
      const [whereArg] = (repo.update as jest.Mock).mock.calls[0];
      expect(whereArg.keyHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('revoke()', () => {
    it('returns true when row updated', async () => {
      const { service, repo } = createService();
      repo.update = jest.fn().mockResolvedValue({ affected: 1 });
      const ok = await service.revoke('k-1', 'user-1');
      expect(ok).toBe(true);
    });

    it('returns false when no rows affected', async () => {
      const { service, repo } = createService();
      repo.update = jest.fn().mockResolvedValue({ affected: 0 });
      const ok = await service.revoke('k-1', 'user-1');
      expect(ok).toBe(false);
    });
  });
});
