import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, type BrowserContext, type Page } from 'patchright';
import { AuthRequiredError } from './auth-required-error';
import { clearStaleLocks } from './clear-stale-locks';
import { optionalBrowserChannel } from './browser-channel';
import { BrowserConfigService } from './browser-config';
import { CookieInjectorService } from './cookie-injector.service';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const STRICT_SESSION_HEALTH_ENABLED = (process.env.STRICT_SESSION_HEALTH_ENABLED ?? 'true').toLowerCase() !== 'false';

export interface LaunchResult {
  context: BrowserContext;
  page: Page;
}

/**
 * Owns the live Patchright contexts: launch with the right user-data-dir,
 * delegate cookie injection to CookieInjectorService, track active contexts
 * for shutdown drain, and close them safely. Probes, diagnostics and
 * profile-tweet scraping live in sibling services so this stays focused on
 * the pool lifecycle.
 */
@Injectable()
export class XBrowserService implements OnModuleDestroy {
  private readonly log = new Logger(XBrowserService.name);
  private readonly active = new Set<BrowserContext>();

  constructor(
    private readonly config: BrowserConfigService,
    private readonly cookies: CookieInjectorService,
  ) {}

  async launch(accountId?: string): Promise<LaunchResult> {
    const profileDir = this.config.resolveProfileDir(accountId);
    clearStaleLocks(profileDir);

    const context = await chromium.launchPersistentContext(profileDir, {
      headless: this.config.cfg.headless,
      ...optionalBrowserChannel(),
      timeout: this.config.cfg.launchTimeoutMs,
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
      await this.cookies.inject(context, accountId);
    }

    this.active.add(context);
    const page = context.pages()[0] ?? (await context.newPage());
    return { context, page };
  }

  async release(context: BrowserContext): Promise<void> {
    // Keep `context` in `active` until close definitively settles —
    // otherwise onModuleDestroy's Promise.allSettled cleanup loses
    // visibility of a still-running close and a leaked subprocess
    // survives a graceful shutdown. We delete in finally so both
    // success and timeout paths converge.
    try {
      await this.withTimeout(
        context.close(),
        this.config.cfg.releaseTimeoutMs,
        `Browser context close timed out after ${this.config.cfg.releaseTimeoutMs}ms`,
      );
    } catch (err) {
      this.log.warn(`Context close warning: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.active.delete(context);
    }
  }

  async assertSessionHealthy(page: Page, _accountId?: string): Promise<void> {
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
}
