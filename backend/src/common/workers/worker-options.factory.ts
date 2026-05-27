import { Injectable } from '@nestjs/common';
import type { WorkerLoopOptions } from './polling-worker.base';

export interface WorkerOptionDefaults {
  pollMs: number;
  lockTtlSec: number;
}

/**
 * Resolves worker loop options from environment variables using a per-worker
 * prefix. Keeps the `<PREFIX>_POLL_MS / <PREFIX>_LOCK_TTL_SEC / <PREFIX>_DISABLED`
 * convention so existing ENV contracts don't break.
 */
@Injectable()
export class WorkerOptionsFactory {
  fromEnv(prefix: string, defaults: WorkerOptionDefaults): WorkerLoopOptions {
    return {
      pollIntervalMs: parseInt(process.env[`${prefix}_POLL_MS`] ?? String(defaults.pollMs), 10),
      lockTtlSec: parseInt(process.env[`${prefix}_LOCK_TTL_SEC`] ?? String(defaults.lockTtlSec), 10),
      enabled: process.env[`${prefix}_DISABLED`] !== 'true',
    };
  }

  intFromEnv(name: string, fallback: number): number {
    return parseInt(process.env[name] ?? String(fallback), 10);
  }
}
