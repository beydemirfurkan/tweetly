import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

const SESSION_TTL_SEC = 60 * 60; // 1 hour — SSE connections that go idle longer get re-established
const SESSION_KEY = (sessionId: string) => `mcp:session:${sessionId}`;

/**
 * Tracks which xtweetly instance currently hosts an MCP SSE session.
 *
 * Single-instance / no Redis: registry is in-memory; lookups always
 * report "self".
 *
 * Multi-instance + REDIS_URL set: each session is registered in Redis
 * as `mcp:session:<id> -> <instanceId>` with a TTL. POST /mcp/messages
 * arriving on the wrong instance can detect this and return a clear
 * 502 instead of a stale 404. Sticky-session load balancing eliminates
 * the wrong-instance case in practice — see docs/multi-instance.md.
 */
@Injectable()
export class McpSessionRouter implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(McpSessionRouter.name);
  readonly instanceId = `${process.pid}-${randomUUID().slice(0, 8)}`;
  private redis: Redis | null = null;

  onModuleInit(): void {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.log.log(
        `MCP session router using in-memory registry (no REDIS_URL); instance=${this.instanceId}`,
      );
      return;
    }
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    this.redis.on('error', (err) =>
      this.log.warn(`Redis error: ${err.message}`),
    );
    this.log.log(`MCP session router using Redis at ${url}; instance=${this.instanceId}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }

  /** Register a session as hosted by this instance. No-op without Redis. */
  async register(sessionId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(SESSION_KEY(sessionId), this.instanceId, 'EX', SESSION_TTL_SEC);
    } catch (err) {
      this.log.warn(`register(${sessionId}) failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Drop the registration when the SSE connection closes. */
  async unregister(sessionId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(SESSION_KEY(sessionId));
    } catch (err) {
      this.log.warn(`unregister(${sessionId}) failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Look up the host instance for a session.
   * Returns the instanceId or null if no registration exists.
   * Without Redis we have no cluster knowledge → return null and let the
   * caller fall back to local-only routing.
   */
  async lookupHost(sessionId: string): Promise<string | null> {
    if (!this.redis) return null;
    try {
      return await this.redis.get(SESSION_KEY(sessionId));
    } catch (err) {
      this.log.warn(`lookupHost(${sessionId}) failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
}
