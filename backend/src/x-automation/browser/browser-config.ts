import * as path from 'path';
import { Injectable } from '@nestjs/common';

const DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS = 45_000;
const DEFAULT_BROWSER_RELEASE_TIMEOUT_MS = 10_000;

export interface BrowserConfig {
  headless: boolean;
  rootDir: string;
  defaultUserDataDir: string;
  launchTimeoutMs: number;
  releaseTimeoutMs: number;
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

@Injectable()
export class BrowserConfigService {
  readonly cfg: BrowserConfig;

  constructor() {
    this.cfg = {
      headless: (process.env.HEADLESS ?? 'true').toLowerCase() !== 'false',
      rootDir: process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data'),
      defaultUserDataDir: process.env.USER_DATA_DIR ?? path.resolve(process.cwd(), 'user-data'),
      launchTimeoutMs: numberFromEnv('PATCHRIGHT_LAUNCH_TIMEOUT_MS', DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS),
      releaseTimeoutMs: numberFromEnv('PATCHRIGHT_RELEASE_TIMEOUT_MS', DEFAULT_BROWSER_RELEASE_TIMEOUT_MS),
    };
  }

  resolveProfileDir(accountId?: string): string {
    if (accountId) {
      return path.join(this.cfg.rootDir, 'user-data', accountId);
    }
    return this.cfg.defaultUserDataDir;
  }
}
