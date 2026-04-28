import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, type BrowserContext, type Page } from 'patchright';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface LaunchResult {
  context: BrowserContext;
  page: Page;
}

export interface BrowserConfig {
  headless: boolean;
  rootDir: string;
  defaultUserDataDir: string;
}

@Injectable()
export class XBrowserService implements OnModuleDestroy {
  private readonly log = new Logger(XBrowserService.name);
  private readonly active = new Set<BrowserContext>();
  private readonly cfg: BrowserConfig;

  constructor() {
    this.cfg = {
      headless: (process.env.HEADLESS ?? 'true').toLowerCase() !== 'false',
      rootDir: process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data'),
      defaultUserDataDir: process.env.USER_DATA_DIR ?? path.resolve(process.cwd(), 'user-data'),
    };
  }

  private clearStaleLocks(profileDir: string): void {
    fs.mkdirSync(profileDir, { recursive: true });
    for (const name of ['SingletonCookie', 'SingletonLock', 'SingletonSocket']) {
      try {
        fs.rmSync(path.join(profileDir, name), { force: true, recursive: true });
      } catch {}
    }
  }

  private resolveProfileDir(accountId?: string): string {
    if (accountId) {
      return path.join(this.cfg.rootDir, 'user-data', accountId);
    }
    return this.cfg.defaultUserDataDir;
  }

  async launch(accountId?: string): Promise<LaunchResult> {
    const profileDir = this.resolveProfileDir(accountId);
    this.clearStaleLocks(profileDir);

    const context = await chromium.launchPersistentContext(profileDir, {
      headless: this.cfg.headless,
      channel: 'chrome',
      viewport: null,
      userAgent: USER_AGENT,
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
      args: ['--disable-blink-features=AutomationControlled'],
    });
    this.active.add(context);
    const page = context.pages()[0] ?? (await context.newPage());
    return { context, page };
  }

  async release(context: BrowserContext): Promise<void> {
    this.active.delete(context);
    try {
      await context.close();
    } catch (err) {
      this.log.warn(`Context close warning: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.active.size === 0) return;
    this.log.log(`Closing ${this.active.size} browser context(s) on shutdown...`);
    await Promise.allSettled([...this.active].map((c) => c.close().catch(() => undefined)));
    this.active.clear();
  }
}
