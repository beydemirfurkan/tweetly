import * as path from 'path';
import { Injectable, Optional } from '@nestjs/common';
import { AppConfigService } from '@/config/app-config.service';
import { envBackedConfig, type EnvBackedConfig } from '@/config/process-env-shim';

const DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS = 45_000;
const DEFAULT_BROWSER_RELEASE_TIMEOUT_MS = 10_000;

export interface BrowserConfig {
  headless: boolean;
  rootDir: string;
  defaultUserDataDir: string;
  launchTimeoutMs: number;
  releaseTimeoutMs: number;
}

@Injectable()
export class BrowserConfigService {
  readonly cfg: BrowserConfig;

  // AppConfigService is Optional so the hand-rolled
  // `new BrowserConfigService()` in specs and smoke scripts keeps working;
  // under DI the global AppConfigModule supplies the real one.
  constructor(@Optional() config?: AppConfigService) {
    const cfg: EnvBackedConfig = config ?? envBackedConfig();
    this.cfg = {
      // Original semantics: headless unless literally 'false'.
      headless: cfg.getString('HEADLESS', '').toLowerCase() !== 'false',
      rootDir: cfg.getString('DATA_DIR', path.resolve(process.cwd(), 'data')),
      defaultUserDataDir: cfg.getString('USER_DATA_DIR', path.resolve(process.cwd(), 'user-data')),
      launchTimeoutMs: positive(cfg.getNumber('PATCHRIGHT_LAUNCH_TIMEOUT_MS', DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS), DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS),
      releaseTimeoutMs: positive(cfg.getNumber('PATCHRIGHT_RELEASE_TIMEOUT_MS', DEFAULT_BROWSER_RELEASE_TIMEOUT_MS), DEFAULT_BROWSER_RELEASE_TIMEOUT_MS),
    };
  }

  resolveProfileDir(accountId?: string): string {
    if (accountId) {
      return path.join(this.cfg.rootDir, 'user-data', accountId);
    }
    return this.cfg.defaultUserDataDir;
  }
}

function positive(n: number, fallback: number): number {
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
