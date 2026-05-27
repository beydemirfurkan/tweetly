import type { Logger } from '@nestjs/common';

export interface HeartbeatOptions {
  extend: () => Promise<unknown>;
  intervalMs: number;
  log: Logger;
  label: string;
}

export interface Heartbeat {
  stop(): void;
}

/**
 * Periodically calls `extend()` until `stop()` is invoked. Failures are
 * logged (not thrown) — a single missed extension shouldn't crash the
 * worker because the next one will catch up before the TTL expires.
 */
export function startHeartbeat(opts: HeartbeatOptions): Heartbeat {
  const timer = setInterval(() => {
    opts.extend().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      opts.log.warn(`heartbeat extend failed ${opts.label}: ${msg}`);
    });
  }, opts.intervalMs);
  timer.unref();
  return {
    stop: () => clearInterval(timer),
  };
}
