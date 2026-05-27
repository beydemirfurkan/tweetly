import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { chromium } from 'patchright';
import { BrowserConfigService, type BrowserConfig } from './browser-config';

export interface BrowserDiagnostics {
  node: {
    version: string;
    platform: NodeJS.Platform;
    arch: string;
    uid: number | null;
  };
  config: BrowserConfig;
  env: {
    playwrightBrowsersPath: string | null;
    patchrightBrowserChannel: string | null;
  };
  paths: {
    cwd: string;
    browserRoot: string | null;
    browserRootExists: boolean;
    browserRootEntries: string[];
    executablePath: string | null;
    executableExists: boolean;
    rootDirExists: boolean;
    defaultUserDataDirExists: boolean;
  };
}

/**
 * Read-only introspection helper for admin diagnostics — surfaces the
 * resolved browser config, env wiring, and filesystem state needed to
 * triage Patchright launch failures from outside the container.
 */
@Injectable()
export class BrowserDiagnosticsService {
  constructor(private readonly config: BrowserConfigService) {}

  getDiagnostics(): BrowserDiagnostics {
    const executablePath = this.resolveExecutablePath();
    const browserRoot = process.env.PLAYWRIGHT_BROWSERS_PATH ?? null;
    const cfg = this.config.cfg;

    return {
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        uid: typeof process.getuid === 'function' ? process.getuid() : null,
      },
      config: cfg,
      env: {
        playwrightBrowsersPath: browserRoot,
        patchrightBrowserChannel: process.env.PATCHRIGHT_BROWSER_CHANNEL ?? null,
      },
      paths: {
        cwd: process.cwd(),
        browserRoot,
        browserRootExists: browserRoot ? fs.existsSync(browserRoot) : false,
        browserRootEntries: browserRoot ? this.safeReadDir(browserRoot) : [],
        executablePath,
        executableExists: executablePath ? fs.existsSync(executablePath) : false,
        rootDirExists: fs.existsSync(cfg.rootDir),
        defaultUserDataDirExists: fs.existsSync(cfg.defaultUserDataDir),
      },
    };
  }

  private resolveExecutablePath(): string | null {
    const maybeChromium = chromium as unknown as { executablePath?: () => string };
    if (typeof maybeChromium.executablePath !== 'function') return null;
    try {
      return maybeChromium.executablePath();
    } catch {
      return null;
    }
  }

  private safeReadDir(dir: string): string[] {
    try {
      return fs.readdirSync(dir).slice(0, 20);
    } catch {
      return [];
    }
  }
}
