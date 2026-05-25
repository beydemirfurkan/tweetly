import { paginateTweets, paginateUsers } from '../read-page.utils';
import type { PaginatedResult } from '../pagination.util';
import type { TweetResult, UserListItem } from '../x-direct.types';
import type { XDirectReadCtx } from './context';

export async function searchTweets(
  ctx: XDirectReadCtx,
  query: string,
  limit: number,
  accountId: string | undefined,
  cursor: string | undefined,
): Promise<PaginatedResult<TweetResult>> {
  return ctx.withSession('searchTweets', accountId, async (page, acctId) => {
    const encoded = encodeURIComponent(query);
    await page.goto(`https://x.com/search?q=${encoded}&f=live`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await ctx.browser.assertSessionHealthy(page, acctId);
    await page.waitForSelector(ctx.sel.tweetArticle, { timeout: 20_000 });
    await page.waitForTimeout(2_000);
    return paginateTweets(page, ctx.tweetSel(), limit, cursor, (s) => ctx.sanitizeText(s));
  });
}

export async function searchUsers(
  ctx: XDirectReadCtx,
  query: string,
  limit: number,
  accountId: string | undefined,
  cursor: string | undefined,
  options: { verifiedOnly?: boolean },
): Promise<PaginatedResult<UserListItem>> {
  return ctx.withSession('searchUsers', accountId, async (page, acctId) => {
    const encoded = encodeURIComponent(query);
    await page.goto(`https://x.com/search?q=${encoded}&f=user`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await ctx.browser.assertSessionHealthy(page, acctId);
    await page.waitForSelector(ctx.sel.userCell, { timeout: 15_000 });
    await page.waitForTimeout(1_500);
    return paginateUsers(page, ctx.userSel(), limit, cursor, options);
  });
}
