import { SettingsService } from '../settings.service';
import { mockRepository } from '@/test/mocks/repository.mock';
import type { SettingEntity } from '@persistence/entities/setting.entity';

function createService() {
  const repo = mockRepository<SettingEntity>();
  const service = new SettingsService(repo as any);
  return { service, repo };
}

describe('SettingsService', () => {
  describe('get()', () => {
    it('returns default value when no row exists and no fallback', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue(null);
      const val = await service.get<number>('max_attempts');
      expect(val).toBe(3);
    });

    it('returns fallback when key has no DEFS entry and no row', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue(null);
      const val = await service.get<string>('unknown.key', 'fallback');
      expect(val).toBe('fallback');
    });

    it('returns parsed number from db row', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue({ key: 'max_attempts', value: '42', type: 'number', accountId: '' } as any);
      const val = await service.get<number>('max_attempts');
      expect(val).toBe(42);
    });

    it('returns parsed boolean true from db row', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue({ key: 'flag', value: 'true', type: 'boolean', accountId: '' } as any);
      const val = await service.get<boolean>('flag');
      expect(val).toBe(true);
    });

    it('returns parsed boolean false from "false" string', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue({ key: 'flag', value: 'false', type: 'boolean', accountId: '' } as any);
      const val = await service.get<boolean>('flag');
      expect(val).toBe(false);
    });

    it('returns parsed json from db row', async () => {
      const { service, repo } = createService();
      const obj = { a: 1 };
      repo.findOne.mockResolvedValue({ key: 'cfg', value: JSON.stringify(obj), type: 'json', accountId: '' } as any);
      const val = await service.get('cfg');
      expect(val).toEqual(obj);
    });

    it('returns null for invalid json', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue({ key: 'cfg', value: 'INVALID', type: 'json', accountId: '' } as any);
      const val = await service.get('cfg');
      expect(val).toBeNull();
    });

    it('prefers account-specific row over global row', async () => {
      const { service, repo } = createService();
      repo.findOne
        .mockResolvedValueOnce({ key: 'max_attempts', value: '10', type: 'number', accountId: 'acc-1' } as any)
        .mockResolvedValue(null);
      const val = await service.get<number>('max_attempts', 20, 'acc-1');
      expect(val).toBe(10);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { key: 'max_attempts', accountId: 'acc-1' } });
    });

    it('falls back to global row when no account-specific row', async () => {
      const { service, repo } = createService();
      repo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ key: 'max_attempts', value: '15', type: 'number', accountId: '' } as any);
      const val = await service.get<number>('max_attempts', 20, 'acc-1');
      expect(val).toBe(15);
    });

    it('caches value and does not query db on second call', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue({ key: 'max_attempts', value: '5', type: 'number', accountId: '' } as any);
      await service.get<number>('max_attempts');
      await service.get<number>('max_attempts');
      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('set()', () => {
    it('calls repo.upsert with correct fields for number', async () => {
      const { service, repo } = createService();
      repo.upsert = jest.fn().mockResolvedValue(undefined);
      await service.set('max_attempts', 30);
      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'max_attempts', value: '30', type: 'number' }),
        ['key', 'accountId'],
      );
    });

    it('calls repo.upsert with json type for objects', async () => {
      const { service, repo } = createService();
      repo.upsert = jest.fn().mockResolvedValue(undefined);
      await service.set('cfg', { a: 1 });
      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'json', value: JSON.stringify({ a: 1 }) }),
        ['key', 'accountId'],
      );
    });

    it('calls repo.upsert with boolean type', async () => {
      const { service, repo } = createService();
      repo.upsert = jest.fn().mockResolvedValue(undefined);
      await service.set('flag', true);
      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'boolean', value: 'true' }),
        ['key', 'accountId'],
      );
    });

    it('invalidates cache after set', async () => {
      const { service, repo } = createService();
      repo.upsert = jest.fn().mockResolvedValue(undefined);
      repo.findOne.mockResolvedValue({ key: 'max_attempts', value: '5', type: 'number', accountId: '' } as any);
      await service.get<number>('max_attempts');
      await service.set('max_attempts', 99);
      repo.findOne.mockResolvedValue({ key: 'max_attempts', value: '99', type: 'number', accountId: '' } as any);
      const val = await service.get<number>('max_attempts');
      expect(val).toBe(99);
    });
  });

  describe('invalidateCache()', () => {
    it('clears all cache when called without key', () => {
      const { service } = createService();
      service.invalidateCache();
    });

    it('clears specific key', () => {
      const { service } = createService();
      service.invalidateCache('max_attempts');
    });
  });

  describe('getDefs()', () => {
    it('returns defs array with known keys', () => {
      const { service } = createService();
      const defs = service.getDefs();
      expect(defs.length).toBeGreaterThan(0);
      expect(defs.find((d) => d.key === 'max_attempts')).toBeDefined();
    });
  });
});
