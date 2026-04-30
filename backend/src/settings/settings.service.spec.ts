import { SettingsService } from './settings.service';
import { mockRepository } from '../test/mocks/repository.mock';
import type { SettingEntity } from '../persistence/entities/setting.entity';

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
      const val = await service.get<number>('tweets_per_day');
      expect(val).toBe(20);
    });

    it('returns fallback when key has no DEFS entry and no row', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue(null);
      const val = await service.get<string>('unknown.key', 'fallback');
      expect(val).toBe('fallback');
    });

    it('returns parsed number from db row', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue({ key: 'tweets_per_day', value: '42', type: 'number', accountId: '' } as any);
      const val = await service.get<number>('tweets_per_day');
      expect(val).toBe(42);
    });

    it('returns parsed boolean true from db row', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue({ key: 'auto_collect.enabled', value: 'true', type: 'boolean', accountId: '' } as any);
      const val = await service.get<boolean>('auto_collect.enabled');
      expect(val).toBe(true);
    });

    it('returns parsed boolean false from "false" string', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue({ key: 'auto_collect.enabled', value: 'false', type: 'boolean', accountId: '' } as any);
      const val = await service.get<boolean>('auto_collect.enabled');
      expect(val).toBe(false);
    });

    it('returns parsed json from db row', async () => {
      const { service, repo } = createService();
      const obj = { a: 1 };
      repo.findOne.mockResolvedValue({ key: 'schedule.hour_weights', value: JSON.stringify(obj), type: 'json', accountId: '' } as any);
      const val = await service.get('schedule.hour_weights');
      expect(val).toEqual(obj);
    });

    it('returns null for invalid json', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue({ key: 'schedule.hour_weights', value: 'INVALID', type: 'json', accountId: '' } as any);
      const val = await service.get('schedule.hour_weights');
      expect(val).toBeNull();
    });

    it('prefers account-specific row over global row', async () => {
      const { service, repo } = createService();
      repo.findOne
        .mockResolvedValueOnce({ key: 'tweets_per_day', value: '10', type: 'number', accountId: 'acc-1' } as any)
        .mockResolvedValue(null);
      const val = await service.get<number>('tweets_per_day', 20, 'acc-1');
      expect(val).toBe(10);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { key: 'tweets_per_day', accountId: 'acc-1' } });
    });

    it('falls back to global row when no account-specific row', async () => {
      const { service, repo } = createService();
      repo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ key: 'tweets_per_day', value: '15', type: 'number', accountId: '' } as any);
      const val = await service.get<number>('tweets_per_day', 20, 'acc-1');
      expect(val).toBe(15);
    });

    it('caches value and does not query db on second call', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue({ key: 'tweets_per_day', value: '5', type: 'number', accountId: '' } as any);
      await service.get<number>('tweets_per_day');
      await service.get<number>('tweets_per_day');
      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('set()', () => {
    it('calls repo.upsert with correct fields for number', async () => {
      const { service, repo } = createService();
      repo.upsert = jest.fn().mockResolvedValue(undefined);
      await service.set('tweets_per_day', 30);
      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'tweets_per_day', value: '30', type: 'number' }),
        ['key', 'accountId'],
      );
    });

    it('calls repo.upsert with json type for objects', async () => {
      const { service, repo } = createService();
      repo.upsert = jest.fn().mockResolvedValue(undefined);
      await service.set('schedule.hour_weights', { '9': 0.3 });
      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'json', value: JSON.stringify({ '9': 0.3 }) }),
        ['key', 'accountId'],
      );
    });

    it('calls repo.upsert with boolean type', async () => {
      const { service, repo } = createService();
      repo.upsert = jest.fn().mockResolvedValue(undefined);
      await service.set('auto_collect.enabled', true);
      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'boolean', value: 'true' }),
        ['key', 'accountId'],
      );
    });

    it('invalidates cache after set', async () => {
      const { service, repo } = createService();
      repo.upsert = jest.fn().mockResolvedValue(undefined);
      repo.findOne.mockResolvedValue({ key: 'tweets_per_day', value: '5', type: 'number', accountId: '' } as any);
      await service.get<number>('tweets_per_day');
      await service.set('tweets_per_day', 99);
      repo.findOne.mockResolvedValue({ key: 'tweets_per_day', value: '99', type: 'number', accountId: '' } as any);
      const val = await service.get<number>('tweets_per_day');
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
      service.invalidateCache('tweets_per_day');
    });
  });

  describe('getDefs()', () => {
    it('returns defs array with known keys', () => {
      const { service } = createService();
      const defs = service.getDefs();
      expect(defs.length).toBeGreaterThan(0);
      expect(defs.find((d) => d.key === 'tweets_per_day')).toBeDefined();
    });
  });

  describe('getScoringWeights()', () => {
    it('returns all 15 scoring keys with defaults when no rows', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue(null);
      const weights = await service.getScoringWeights();
      expect(weights.relevanceHigh).toBe(20);
      expect(weights.popularityHigh).toBe(25);
      expect(Object.keys(weights)).toHaveLength(15);
    });
  });

  describe('getFormatWeights()', () => {
    it('returns format weight map with defaults', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue(null);
      const weights = await service.getFormatWeights();
      expect(weights.no_link_hook).toBe(5);
      expect(weights.question).toBe(4);
    });
  });

  describe('getThreadDays()', () => {
    it('parses "2,4" into [2,4]', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue({ key: 'thread.days', value: '2,4', type: 'string', accountId: '' } as any);
      const days = await service.getThreadDays();
      expect(days).toEqual([2, 4]);
    });

    it('returns empty array for empty string', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue(null);
      jest.spyOn(service, 'get').mockResolvedValue('' as any);
      const days = await service.getThreadDays();
      expect(days).toEqual([]);
    });
  });

  describe('getSourceQualityWeights()', () => {
    it('returns 6 source quality weights with defaults', async () => {
      const { service, repo } = createService();
      repo.findOne.mockResolvedValue(null);
      const weights = await service.getSourceQualityWeights();
      expect(weights.sourceTrust).toBe(20);
      expect(weights.topicFit).toBe(25);
      expect(Object.keys(weights)).toHaveLength(6);
    });
  });
});
