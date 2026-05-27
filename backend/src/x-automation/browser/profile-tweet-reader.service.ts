import { Injectable } from '@nestjs/common';
import { XBrowserService } from './x-browser.service';
import { SelectorRegistry } from './selector-registry';
import { extractTweetCards, type BrowserTweetResult } from './profile-tweet-extractor';

export type { BrowserTweetResult };

/**
 * Opens a profile page and extracts the first N tweet cards via the
 * shared selector registry. Pulled out of XBrowserService so the
 * production launch path doesn't carry profile-scraping concerns.
 */
@Injectable()
export class ProfileTweetReaderService {
  constructor(
    private readonly browser: XBrowserService,
    private readonly sel: SelectorRegistry,
  ) {}

  async readProfileTweets(handle: string, limit: number, accountId: string): Promise<BrowserTweetResult[]> {
    const { context, page } = await this.browser.launch(accountId);
    try {
      await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(5_000);
      return await extractTweetCards(page, limit, this.sel);
    } finally {
      await this.browser.release(context);
    }
  }
}
