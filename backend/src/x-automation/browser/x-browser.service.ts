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

export interface BrowserProbeResult {
  ok: boolean;
  accountId: string | null;
  launchMs: number | null;
  releaseMs: number | null;
  pageCount: number | null;
  url: string | null;
  error: string | null;
}

export interface BrowserNavigateProbeResult extends BrowserProbeResult {
  targetUrl: string;
  gotoMs: number | null;
  waitMs: number | null;
  selector: string | null;
  selectorCount: number | null;
  tweetCount: number | null;
  firstTweetUrl: string | null;
  title: string | null;
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

    const context = await chromium.launchPersistentContext(profileDir, {
      headless: this.cfg.headless,
      ...optionalBrowserChannel(),
      timeout: this.cfg.launchTimeoutMs,
      viewport: null,
      userAgent: USER_AGENT,
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    if (accountId) {
      await this.injectCookies(context, accountId);
    }

    this.active.add(context);
    const page = context.pages()[0] ?? (await context.newPage());
    return { context, page };
  }

  getDiagnostics(): BrowserDiagnostics {
    const executablePath = this.resolveExecutablePath();
    const browserRoot = process.env.PLAYWRIGHT_BROWSERS_PATH ?? null;

    return {
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        uid: typeof process.getuid === 'function' ? process.getuid() : null,
      },
      config: this.cfg,
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
        rootDirExists: fs.existsSync(this.cfg.rootDir),
        defaultUserDataDirExists: fs.existsSync(this.cfg.defaultUserDataDir),
      },
    };
  }

  async probeLaunch(accountId?: string): Promise<BrowserProbeResult> {
    const startedAt = Date.now();
    let context: BrowserContext | null = null;
    let launchMs: number | null = null;
    try {
      const launched = await this.launch(accountId);
      context = launched.context;
      launchMs = Date.now() - startedAt;

      const releaseStartedAt = Date.now();
      await this.release(context);
      context = null;

      return {
        ok: true,
        accountId: accountId ?? null,
        launchMs,
        releaseMs: Date.now() - releaseStartedAt,
        pageCount: launched.context.pages().length,
        url: launched.page.url(),
        error: null,
      };
    } catch (err) {
      if (context) {
        await this.release(context);
      }

      return {
        ok: false,
        accountId: accountId ?? null,
        launchMs,
        releaseMs: null,
        pageCount: null,
        url: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async probeNavigate(
    targetUrl: string,
    accountId?: string,
    options: { waitMs?: number; selector?: string; extractTweets?: boolean } = {},
  ): Promise<BrowserNavigateProbeResult> {
    const startedAt = Date.now();
    let context: BrowserContext | null = null;
    let launchMs: number | null = null;
    try {
      const launched = await this.launch(accountId);
      context = launched.context;
      launchMs = Date.now() - startedAt;

      const gotoStartedAt = Date.now();
      await launched.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const gotoMs = Date.now() - gotoStartedAt;
      const waitMs = Math.max(0, Math.min(options.waitMs ?? 0, 15_000));
      if (waitMs > 0) {
        await launched.page.waitForTimeout(waitMs);
      }
      const selector = options.selector?.trim() || null;
      const selectorCount = selector
        ? await launched.page.evaluate((value) => document.querySelectorAll(value).length, selector)
        : null;
      const tweets = options.extractTweets
        ? await launched.page.evaluate(() => {
          return Array.from(document.querySelectorAll('article[data-testid="tweet"]')).map((article) => {
            const link = Array.from(article.querySelectorAll('a[href*="/status/"]'))[0] as HTMLAnchorElement | undefined;
            return { url: link?.href ?? '' };
          });
        }) as Array<{ url: string }>
        : null;
      const title = await launched.page.title().catch(() => null);
      const url = launched.page.url();

      const releaseStartedAt = Date.now();
      await this.release(context);
      context = null;

      return {
        ok: true,
        accountId: accountId ?? null,
        targetUrl,
        launchMs,
        gotoMs,
        waitMs,
        releaseMs: Date.now() - releaseStartedAt,
        pageCount: launched.context.pages().length,
        url,
        selector,
        selectorCount,
        tweetCount: tweets?.length ?? null,
        firstTweetUrl: tweets?.[0]?.url ?? null,
        title,
        error: null,
      };
    } catch (err) {
      if (context) {
        await this.release(context);
      }

      return {
        ok: false,
        accountId: accountId ?? null,
        targetUrl,
        launchMs,
        gotoMs: null,
        waitMs: options.waitMs ?? null,
        releaseMs: null,
        pageCount: null,
        url: null,
        selector: options.selector ?? null,
        selectorCount: null,
        tweetCount: null,
        firstTweetUrl: null,
        title: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
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
