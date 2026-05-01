import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, type BrowserContext, type Page } from 'patchright';
import { AccountsService } from '../../accounts/accounts.service';
import { AuthRequiredError } from './auth-required-error';
import { optionalBrowserChannel } from './browser-channel';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const X_COOKIE_DOMAIN = '.x.com';
const X_COOKIE_PATH = '/';
const STRICT_SESSION_HEALTH_ENABLED = (process.env.STRICT_SESSION_HEALTH_ENABLED ?? 'true').toLowerCase() !== 'false';
const DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS = 45_000;
const DEFAULT_BROWSER_RELEASE_TIMEOUT_MS = 10_000;

export interface LaunchResult {
  context: BrowserContext;
  page: Page;
}

export interface BrowserConfig {
  headless: boolean;
  rootDir: string;
  defaultUserDataDir: string;
  launchTimeoutMs: number;
  releaseTimeoutMs: number;
}

@Injectable()
export class XBrowserService implements OnModuleDestroy {
  private readonly log = new Logger(XBrowserService.name);
  private readonly active = new Set<BrowserContext>();
  private readonly cfg: BrowserConfig;

  constructor(private readonly accounts: AccountsService) {
    this.cfg = {
      headless: (process.env.HEADLESS ?? 'true').toLowerCase() !== 'false',
      rootDir: process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data'),
      defaultUserDataDir: process.env.USER_DATA_DIR ?? path.resolve(process.cwd(), 'user-data'),
      launchTimeoutMs: this.numberFromEnv('PATCHRIGHT_LAUNCH_TIMEOUT_MS', DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS),
      releaseTimeoutMs: this.numberFromEnv('PATCHRIGHT_RELEASE_TIMEOUT_MS', DEFAULT_BROWSER_RELEASE_TIMEOUT_MS),
    };
  }

  private numberFromEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      timer.unref?.();
    });

    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
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

    let launchTimedOut = false;
    const launchPromise = chromium.launchPersistentContext(profileDir, {
      headless: this.cfg.headless,
      ...optionalBrowserChannel(),
      viewport: null,
      userAgent: USER_AGENT,
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
      args: ['--disable-blink-features=AutomationControlled'],
    });
    launchPromise.then((context) => {
      if (launchTimedOut) {
        context.close().catch(() => undefined);
      }
    }).catch(() => undefined);

    let context: BrowserContext;
    try {
      context = await this.withTimeout(
        launchPromise,
        this.cfg.launchTimeoutMs,
        `Browser launch timed out after ${this.cfg.launchTimeoutMs}ms`,
      );
    } catch (err) {
      launchTimedOut = true;
      throw err;
    }

    if (accountId) {
      await this.injectCookies(context, accountId);
    }

    this.active.add(context);
    const page = context.pages()[0] ?? (await context.newPage());
    return { context, page };
  }

  private async injectCookies(context: BrowserContext, accountId: string): Promise<void> {
    const account = await this.accounts.findById(accountId);
    if (!account?.authToken) return;

    const cookies = [
      {
        name: 'auth_token',
        value: account.authToken,
        domain: X_COOKIE_DOMAIN,
        path: X_COOKIE_PATH,
        httpOnly: true,
        secure: true,
        sameSite: 'None' as const,
      },
    ];

    if (account.ct0) {
      cookies.push({
        name: 'ct0',
        value: account.ct0,
        domain: X_COOKIE_DOMAIN,
        path: X_COOKIE_PATH,
        httpOnly: false,
        secure: true,
        sameSite: 'None' as const,
      });
    }

    await context.addCookies(cookies);
    this.log.log(`Cookies injected for account ${accountId}`);
  }

  async release(context: BrowserContext): Promise<void> {
    this.active.delete(context);
    try {
      const closePromise = context.close();
      closePromise.catch(() => undefined);
      await this.withTimeout(
        closePromise,
        this.cfg.releaseTimeoutMs,
        `Browser context close timed out after ${this.cfg.releaseTimeoutMs}ms`,
      );
    } catch (err) {
      this.log.warn(`Context close warning: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async assertSessionHealthy(page: Page, accountId?: string): Promise<void> {
    if (!STRICT_SESSION_HEALTH_ENABLED) return;

    const url = page.url();
    const title = await page.title().catch(() => 'unknown');
    const loggedOut =
      url.includes('/login') ||
      url.includes('/i/flow') ||
      url === 'https://x.com/' ||
      title.includes('Olan biten burada');

    if (loggedOut) {
      const reason = `X logged-out görünüyor. URL=${url} title=${title}`;
      throw new AuthRequiredError(reason);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.active.size === 0) return;
    this.log.log(`Closing ${this.active.size} browser context(s) on shutdown...`);
    await Promise.allSettled([...this.active].map((c) => c.close().catch(() => undefined)));
    this.active.clear();
  }
}
