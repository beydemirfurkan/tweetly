import { extractTweetsFromPage, paginateTweets } from '../read-page.utils';
import type { PaginatedResult } from '../pagination.util';
import type { TweetResult, UserListItem } from '../x-direct.types';
import type { XDirectReadCtx } from './context';

export function getTweetRetweeters(
  ctx: XDirectReadCtx,
  tweetUrl: string,
  limit: number,
  accountId: string | undefined,
  cursor: string | undefined,
  options: { verifiedOnly?: boolean },
): Promise<PaginatedResult<UserListItem>> {
  const url = tweetUrl.replace(/\/$/, '') + '/retweets';
  return ctx.scrapeUserList(url, limit, accountId, cursor, options);
}

export async function getTweetQuotes(
  ctx: XDirectReadCtx,
  tweetUrl: string,
  limit: number,
  accountId: string | undefined,
  cursor: string | undefined,
): Promise<PaginatedResult<TweetResult>> {
  return ctx.withSession('getTweetQuotes', accountId, async (page, acctId) => {
    const url = tweetUrl.replace(/\/$/, '') + '/quotes';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await ctx.browser.assertSessionHealthy(page, acctId);
    try {
      await page.waitForSelector(ctx.sel.tweetArticle, { timeout: 8_000 });
    } catch {
      return { items: [], nextCursor: null };
    }
    await page.waitForTimeout(1_500);
    return paginateTweets(page, ctx.tweetSel(), limit, cursor, (s) => ctx.sanitizeText(s));
  });
}

export async function getTweetReplies(
  ctx: XDirectReadCtx,
  tweetUrl: string,
  limit: number,
  accountId: string | undefined,
  cursor: string | undefined,
): Promise<PaginatedResult<TweetResult>> {
  return ctx.withSession('getTweetReplies', accountId, async (page, acctId) => {
    await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await ctx.browser.assertSessionHealthy(page, acctId);
    try {
      await page.waitForSelector(ctx.sel.tweetArticle, { timeout: 12_000 });
    } catch {
      return { items: [], nextCursor: null };
    }
    await page.waitForTimeout(2_000);

    // The conversation page renders the parent tweet first; drop it from
    // the reply list. We over-fetch then filter.
    const normalizedRoot = tweetUrl.replace(/\/$/, '');
    const page1 = await paginateTweets(
      page,
      ctx.tweetSel(),
      limit + 1,
      cursor,
      (s) => ctx.sanitizeText(s),
    );
    const items = page1.items
      .filter((t) => t.url.replace(/\/$/, '') !== normalizedRoot)
      .slice(0, limit);
    return { items, nextCursor: items.length === limit ? page1.nextCursor : null };
  });
}

export async function getTweet(
  ctx: XDirectReadCtx,
  tweetUrl: string,
  accountId: string | undefined,
): Promise<TweetResult> {
  return ctx.withSession('getTweet', accountId, async (page, acctId) => {
    await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await ctx.browser.assertSessionHealthy(page, acctId);
    await page.waitForSelector(ctx.sel.tweetArticle, { timeout: 15_000 });
    await page.waitForTimeout(1_500);

    const results = await extractTweetsFromPage(page, ctx.tweetSel(), 1, (s) =>
      ctx.sanitizeText(s),
    );
    if (results.length === 0) throw new Error('Tweet not found or could not be parsed');
    return { ...results[0], url: tweetUrl };
  });
}

export async function getThread(
  ctx: XDirectReadCtx,
  rootTweetUrl: string,
  limit: number,
  accountId: string | undefined,
): Promise<TweetResult[]> {
  return ctx.withSession('getThread', accountId, async (page, acctId) => {
    await page.goto(rootTweetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await ctx.browser.assertSessionHealthy(page, acctId);
    try {
      await page.waitForSelector(ctx.sel.tweetArticle, { timeout: 12_000 });
    } catch {
      return [];
    }
    await page.waitForTimeout(2_000);

    const cap = Math.min(Math.max(limit, 1), 50);

    // First-pass extract before any scrolling — captures the root tweet
    // even if the conversation page later behaves oddly under scroll.
    const collected: TweetResult[] = [];
    const seen = new Set<string>();
    const ingest = (rows: TweetResult[]) => {
      for (const tweet of rows) {
        const key = tweet.url || `${tweet.handle}:${tweet.postedAt}`;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        collected.push(tweet);
      }
    };
    ingest(
      await extractTweetsFromPage(page, ctx.tweetSel(), 200, (s) => ctx.sanitizeText(s)),
    );

    // Now scroll incrementally to load same-author follow-ups in the
    // conversation tree. Re-extract after each scroll into the same
    // dedup set so we accumulate without losing what we already saw.
    const scrolls = Math.min(Math.ceil(cap / 5), 5);
    for (let i = 0; i < scrolls; i++) {
      await page.evaluate(() => window.scrollBy(0, 2500));
      await page.waitForTimeout(1_500);
      ingest(
        await extractTweetsFromPage(page, ctx.tweetSel(), 200, (s) => ctx.sanitizeText(s)),
      );
    }

    if (collected.length === 0) return [];

    // Root handle = path segment of the root URL (avoids relying on which
    // article appears first in DOM after redirects).
    const rootPath = new URL(rootTweetUrl).pathname.split('/').filter(Boolean);
    const rootHandle = rootPath[0]?.toLowerCase() ?? '';

    const chain: TweetResult[] = [];
    for (const tweet of collected) {
      if (tweet.handle.toLowerCase() !== rootHandle) continue;
      chain.push(tweet);
      if (chain.length >= cap) break;
    }
    return chain;
  });
}
