import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

export interface AuthCodeRecord {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
}

const CODE_TTL_SEC = 60;
const codeKey = (code: string) => `oauth:code:${code}`;

/**
 * One-shot auth code store. Codes live ≤60s, single-use (consume = atomic
 * GET + DEL). Redis-backed for multi-instance; falls back to in-memory map
 * with manual TTL when REDIS_URL is unset.
 */
@Injectable()
export class OAuthCodeStore implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OAuthCodeStore.name);
  private redis: Redis | null = null;
  private memory = new Map<string, { value: AuthCodeRecord; expiresAt: number }>();

  onModuleInit(): void {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.log.log('OAuthCodeStore using in-memory backend (no REDIS_URL)');
      return;
    }
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    this.redis.on('error', (err) => this.log.warn(`Redis error: ${err.message}`));
    this.log.log(`OAuthCodeStore using Redis at ${url}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }

  async put(code: string, record: AuthCodeRecord): Promise<void> {
    if (this.redis) {
      await this.redis.set(codeKey(code), JSON.stringify(record), 'EX', CODE_TTL_SEC, 'NX');
      return;
    }
    this.memory.set(code, { value: record, expiresAt: Date.now() + CODE_TTL_SEC * 1000 });
  }

  /** Atomic consume: returns the record and removes it. null if missing/expired. */
  async consume(code: string): Promise<AuthCodeRecord | null> {
    if (this.redis) {
      const raw = await this.redis.getdel(codeKey(code));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as AuthCodeRecord;
      } catch {
        return null;
      }
    }
    const entry = this.memory.get(code);
    if (!entry) return null;
    this.memory.delete(code);
    if (entry.expiresAt < Date.now()) return null;
    return entry.value;
  }
}
