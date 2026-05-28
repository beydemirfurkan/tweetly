import { Injectable, Optional } from '@nestjs/common';
import type { WorkerLoopOptions } from './polling-worker.base';
import { AppConfigService } from '@/config/app-config.service';
import { envBackedConfig, type EnvBackedConfig } from '@/config/process-env-shim';

export interface WorkerOptionDefaults {
  pollMs: number;
  lockTtlSec: number;
}

/**
 * Resolves worker loop options from environment variables using a per-worker
 * prefix. Keeps the `<PREFIX>_POLL_MS / <PREFIX>_LOCK_TTL_SEC / <PREFIX>_DISABLED`
 * convention so existing ENV contracts don't break.
 *
 * AppConfigService is Optional so smoke-scripts and ad-hoc constructions
 * (which historically called `new WorkerOptionsFactory()` with no args) keep
 * working; when missing, the shared env-backed shim is used.
 */
@Injectable()
export class WorkerOptionsFactory {
  private readonly config: EnvBackedConfig;

  constructor(@Optional() config?: AppConfigService) {
    this.config = config ?? envBackedConfig();
  }

  fromEnv(prefix: string, defaults: WorkerOptionDefaults): WorkerLoopOptions {
    return {
      pollIntervalMs: this.config.getNumber(`${prefix}_POLL_MS`, defaults.pollMs),
      lockTtlSec: this.config.getNumber(`${prefix}_LOCK_TTL_SEC`, defaults.lockTtlSec),
      // Original semantics: enabled unless the value is exactly 'true'.
      enabled: this.config.getString(`${prefix}_DISABLED`, '') !== 'true',
    };
  }

  intFromEnv(name: string, fallback: number): number {
    return this.config.getNumber(name, fallback);
  }
}
