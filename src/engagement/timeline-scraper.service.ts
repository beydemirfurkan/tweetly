import { Injectable, Logger } from '@nestjs/common';
import { chromium, type BrowserContext, type Page } from 'patchright';

export interface ScrapedTweet {
  tweetUrl: string;
  authorHandle: string;
  contentText: string;
  likeCount: number;
}

@Injectable()
export class TimelineScraper {
  private readonly log = new Logger(TimelineScraper.name);

  async scrape(accountId: string, profileDir: string, maxTweets = 25): Promise<ScrapedTweet[]> {
    let ctx: BrowserContext | null = null;

    try {
      ctx = await chromium.launchPersistentContext(profileDir, {
        headless: true,
        channel: 'chrome',
        viewport: { width: 1280, height: 900 },
        args: ['--disable-blink-features=AutomationControlled'],
      });

      const page = ctx.pages()[0] ?? await ctx.newPage();
      await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15_000 });

      const tweets = await this.collectTweets(page, maxTweets);
      this.log.log(`Scraped ${tweets.length} tweets for @${accountId}`);
      return tweets;
    } catch (err) {
      this.log.error(`Timeline scrape failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    } finally {
      if (ctx) await ctx.close().catch(() => undefined);
    }
  }

  private async collectTweets(page: Page, max: number): Promise<ScrapedTweet[]> {
    const collected = new Map<string, ScrapedTweet>();
    let scrollAttempts = 0;
    const maxScrolls = 15;

    while (collected.size < max && scrollAttempts < maxScrolls) {
      const batch = await this.extractVisibleTweets(page);
      for (const t of batch) {
        if (!collected.has(t.tweetUrl)) {
          collected.set(t.tweetUrl, t);
        }
      }

      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await page.waitForTimeout(1500 + Math.random() * 1000);
      scrollAttempts++;
    }

    return [...collected.values()].slice(0, max);
  }

  private async extractVisibleTweets(page: Page): Promise<ScrapedTweet[]> {
    return page.evaluate(() => {
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      const results: Array<{
        tweetUrl: string;
        authorHandle: string;
        contentText: string;
        likeCount: number;
      }> = [];

      for (const article of articles) {
        try {
          const timeEl = article.querySelector('time');
          const linkEl = timeEl?.closest('a[href*="/status/"]');
          const href = linkEl?.getAttribute('href');
          if (!href) continue;

          const tweetUrl = href.startsWith('http') ? href : `https://x.com${href}`;

          const userLink = article.querySelector('a[href^="/"][role="link"]');
          const authorHandle = userLink?.getAttribute('href')?.replace('/', '') ?? '';

          const textEl = article.querySelector('[data-testid="tweetText"]');
          const contentText = textEl?.textContent?.trim() ?? '';

          const likeGroup = article.querySelector('[data-testid="like"]');
          const likeText = likeGroup?.getAttribute('aria-label') ?? '';
          const likeMatch = likeText.match(/(\d[\d,.]*)\s*(like|beğeni)/i);
          const likeCount = likeMatch ? parseInt(likeMatch[1].replace(/[.,]/g, '')) : 0;

          results.push({ tweetUrl, authorHandle, contentText, likeCount });
        } catch {}
      }
      return results;
    });
  }
}
