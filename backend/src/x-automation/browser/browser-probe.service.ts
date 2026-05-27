import { Injectable } from '@nestjs/common';
import type { BrowserContext } from 'patchright';
import { XBrowserService } from './x-browser.service';
import { SelectorRegistry } from './selector-registry';

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

/**
 * Admin/diagnostic probes that drive a full Patchright launch + navigation
 * to surface latency, selector counts and tweet card extraction without
 * touching the production execution paths. Kept off XBrowserService so the
 * production launch path stays focused.
 */
@Injectable()
export class BrowserProbeService {
  constructor(
    private readonly browser: XBrowserService,
    private readonly sel: SelectorRegistry,
  ) {}

  async probeLaunch(accountId?: string): Promise<BrowserProbeResult> {
    const startedAt = Date.now();
    let context: BrowserContext | null = null;
    let launchMs: number | null = null;
    try {
      const launched = await this.browser.launch(accountId);
      context = launched.context;
      launchMs = Date.now() - startedAt;

      const releaseStartedAt = Date.now();
      await this.browser.release(context);
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
        await this.browser.release(context);
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
      const launched = await this.browser.launch(accountId);
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
        ? await launched.page.evaluate((p) => {
          return Array.from(document.querySelectorAll(p.tweetArticle)).map((article) => {
            const link = Array.from(article.querySelectorAll('a[href*="/status/"]'))[0] as HTMLAnchorElement | undefined;
            return { url: link?.href ?? '' };
          });
        }, { tweetArticle: this.sel.tweetArticle }) as Array<{ url: string }>
        : null;
      const title = await launched.page.title().catch(() => null);
      const url = launched.page.url();

      const releaseStartedAt = Date.now();
      await this.browser.release(context);
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
        await this.browser.release(context);
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
}
