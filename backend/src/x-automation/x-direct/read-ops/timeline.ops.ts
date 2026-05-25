import { paginateTweets } from '../read-page.utils';
import type { PaginatedResult } from '../pagination.util';
import type { TweetResult } from '../x-direct.types';
import type { XDirectReadCtx } from './context';

export async function getMyBookmarks(
  ctx: XDirectReadCtx,
  limit: number,
  accountId: string | undefined,
  cursor: string | undefined,
): Promise<PaginatedResult<TweetResult>> {
  return ctx.withSession('getMyBookmarks', accountId, async (page, acctId) => {
    await page.goto('https://x.com/i/bookmarks', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await ctx.browser.assertSessionHealthy(page, acctId);
    try {
      await page.waitForSelector(ctx.sel.tweetArticle, { timeout: 12_000 });
    } catch {
      return { items: [], nextCursor: null };
    }
    await page.waitForTimeout(1_500);
    return paginateTweets(page, ctx.tweetSel(), limit, cursor, (s) => ctx.sanitizeText(s));
  });
}

export async function getXTrending(
  ctx: XDirectReadCtx,
  accountId: string | undefined,
): Promise<Array<{ rank: number; topic: string; tweetCount: string }>> {
  return ctx.withSession('getXTrending', accountId, async (page, acctId) => {
    await page.goto('https://x.com/explore/tabs/trending', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await ctx.browser.assertSessionHealthy(page, acctId);
    await page.waitForSelector(ctx.sel.trend, { timeout: 15_000 });
    await page.waitForTimeout(1_500);

    return page.evaluate(extractTrendingFromDom, { trend: ctx.sel.trend });
  });
}

/**
 * Runs inside `page.evaluate` — self-contained DOM parser. Reads the
 * trending list cells and filters out promoted/sponsored items.
 */
function extractTrendingFromDom(params: {
  trend: string;
}): Array<{ rank: number; topic: string; tweetCount: string }> {
  const trends = Array.from(document.querySelectorAll(params.trend));
  return trends
    .map((el, i) => {
      const texts = Array.from(el.querySelectorAll('span'))
        .map((span) => span.textContent?.trim() ?? '')
        .filter(Boolean);
      const topic = texts.find((text) => isTrendTopic(text)) ?? '';
      const countEl = texts.find(
        (text) =>
          /\d/.test(text) && /(\d[\d.,\s]*(b|k|m)\b|posts?|tweets?|gönderi)/i.test(text),
      );
      return { rank: i + 1, topic, tweetCount: countEl ?? '' };
    })
    .filter((trend) => trend.topic);

  function isTrendTopic(text: string): boolean {
    const normalized = text.toLowerCase();
    if (text === '·') return false;
    if (/^\d+$/.test(text)) return false;
    if (/(gündem|trending|trend|sponsorlu|promoted|posts?|tweets?|gönderi)/i.test(normalized)) {
      return false;
    }
    return true;
  }
}
