import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettingEntity } from '../persistence/entities/setting.entity';

type SettingType = 'string' | 'number' | 'boolean' | 'json';

interface SettingDef {
  key: string;
  defaultValue: unknown;
  type: SettingType;
}

const DEFS: SettingDef[] = [
  { key: 'max_attempts', defaultValue: 3, type: 'number' },
  { key: 'reply_delay_ms', defaultValue: 10000, type: 'number' },
  { key: 'content_memory_max', defaultValue: 500, type: 'number' },
];

const CACHE_TTL_MS = 60_000;

@Injectable()
export class SettingsService {
  private readonly cache = new Map<string, { value: unknown; cachedAt: number }>();

  constructor(
    @InjectRepository(SettingEntity)
    private readonly repo: Repository<SettingEntity>,
  ) {}

  async get<T = unknown>(key: string, fallback?: T, accountId?: string): Promise<T> {
    const cacheKey = accountId ? `${accountId}:${key}` : key;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
      return cached.value as T;
    }

    let row: SettingEntity | null = null;
    if (accountId) {
      row = await this.repo.findOne({ where: { key, accountId } });
    }
    if (!row) {
      row = await this.repo.findOne({ where: { key, accountId: '' } });
    }

    if (!row) {
      const def = DEFS.find((d) => d.key === key);
      const value = def !== undefined ? def.defaultValue : fallback;
      return value as T;
    }

    const value = parseValue(row.value, row.type);
    this.cache.set(cacheKey, { value, cachedAt: now });
    return value as T;
  }

  async set(key: string, value: unknown, accountId?: string): Promise<void> {
    const type = inferType(value);
    const raw = type === 'json' ? JSON.stringify(value) : String(value);
    await this.repo.upsert(
      { key, accountId: accountId ?? '', value: raw, type, updatedAt: new Date() },
      ['key', 'accountId'],
    );
    this.invalidateCache(key, accountId);
  }

  getDefs(): readonly SettingDef[] {
    return DEFS;
  }

  invalidateCache(key?: string, accountId?: string): void {
    if (!key) {
      this.cache.clear();
      return;
    }
    const cacheKey = accountId ? `${accountId}:${key}` : key;
    this.cache.delete(cacheKey);
  }
}

function parseValue(raw: string, type: string): unknown {
  switch (type) {
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
    case 'boolean':
      return raw === 'true' || raw === '1';
    case 'json':
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    default:
      return raw;
  }
}

function inferType(value: unknown): SettingType {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'string';
}
