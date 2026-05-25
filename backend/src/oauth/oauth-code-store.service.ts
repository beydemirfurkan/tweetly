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
// Belt-and-suspenders for the in-memory backend: codes are TTL-pruned on
// every put() call, but a runaway producer could still queue thousands
// of unconsumed entries in the gap between sweeps. Cap rejects new puts
// once the map fills, so memory is bounded regardless of producer rate.
//
// 10_000 entries × ~200 B/entry ≈ 2 MB worst case. Redis-backed
// deployments never hit this — codes there expire via EX TTL.
// Read at call time so tests can flip the cap via env between cases.
function inMemoryCap(): number {
  return parseInt(process.env.OAUTH_CODE_STORE_IN_MEMORY_CAP ?? '10000', 10);
}
const codeKey = (code: string) => `oauth:code:${code}`;

/**
 * One-shot auth code store. Codes live ≤60s, single-use (consume = atomic
 * GET + DEL). Redis-backed for multi-instance; falls back to in-memory map
 * with manual TTL when REDIS_URL is unset.
 *
 * The in-memory backend is dev-only — for multi-user deployments set
 * REDIS_URL so codes survive restarts and aren't bounded by a single
 * Node process's memory. The cap + sweep below keep the dev fallback
 * from leaking unbounded heap when users abandon the OAuth flow.
 */
@Injectable()
export class OAuthCodeStore implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OAuthCodeStore.name);
  private redis: Redis | null = null;
  private memory = new Map<string, { value: AuthCodeRecord; expiresAt: number }>();

  onModuleInit(): void {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.log.log(
        `OAuthCodeStore using in-memory backend (no REDIS_URL) — dev only. Cap=${inMemoryCap()}`,
      );
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
    // Sweep expired entries before inserting — keeps the map clean during
    // normal-rate use without needing a separate interval timer.
    this.sweepInMemory();
    const cap = inMemoryCap();
    if (this.memory.size >= cap) {
      // Hard cap reached even after a sweep: producer is faster than the
      // 60s TTL window. Reject so we never grow unbounded. Authorize flow
      // surfaces this to the user; in practice it only triggers on abuse
      // or a real REDIS_URL misconfiguration.
      this.log.warn(
        `OAuthCodeStore in-memory cap reached (${cap}). Rejecting new code; set REDIS_URL for production-scale traffic.`,
      );
      throw new Error('oauth code store full — set REDIS_URL for production');
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

  /**
   * Visible for tests. Drops every in-memory entry whose `expiresAt` has
   * already passed. Cheap O(n) over a map that's bounded by IN_MEMORY_CAP.
   */
  sweepInMemory(): number {
    if (this.redis) return 0;
    const now = Date.now();
    let dropped = 0;
    for (const [code, entry] of this.memory.entries()) {
      if (entry.expiresAt < now) {
        this.memory.delete(code);
        dropped++;
      }
    }
    return dropped;
  }

  /** Visible for tests. */
  sizeInMemory(): number {
    return this.memory.size;
  }
}
