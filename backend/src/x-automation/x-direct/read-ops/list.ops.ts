import type { PaginatedResult } from '../pagination.util';
import type { ListDetailItem, UserListItem } from '../x-direct.types';
import type { XDirectReadCtx } from './context';

export function getListMembers(
  ctx: XDirectReadCtx,
  listId: string,
  limit: number,
  accountId: string | undefined,
  cursor: string | undefined,
  options: { verifiedOnly?: boolean },
): Promise<PaginatedResult<UserListItem>> {
  return ctx.scrapeUserList(
    `https://x.com/i/lists/${listId}/members`,
    limit,
    accountId,
    cursor,
    options,
  );
}

export function getListSubscribers(
  ctx: XDirectReadCtx,
  listId: string,
  limit: number,
  accountId: string | undefined,
  cursor: string | undefined,
  options: { verifiedOnly?: boolean },
): Promise<PaginatedResult<UserListItem>> {
  return ctx.scrapeUserList(
    `https://x.com/i/lists/${listId}/subscribers`,
    limit,
    accountId,
    cursor,
    options,
  );
}

export async function getList(
  ctx: XDirectReadCtx,
  listId: string,
  accountId: string | undefined,
): Promise<ListDetailItem> {
  return ctx.withSession('getList', accountId, async (page, acctId) => {
    await page.goto(`https://x.com/i/lists/${listId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await ctx.browser.assertSessionHealthy(page, acctId);
    // Header content lives inside primaryColumn before the timeline loads.
    await page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 15_000 });
    await page.waitForTimeout(2_000);

    const raw = await page.evaluate(extractListHeaderFromDom);

    if (!raw) throw new Error(`list ${listId} not found or could not be parsed`);

    return {
      listId,
      name: ctx.sanitizeText(raw.name),
      description: ctx.sanitizeText(raw.description),
      memberCount: raw.memberCount,
      subscriberCount: raw.subscriberCount,
      ownerHandle: raw.ownerHandle,
      ownerDisplayName: ctx.sanitizeText(raw.ownerDisplayName),
      url: `https://x.com/i/lists/${listId}`,
    };
  });
}

/**
 * Runs inside `page.evaluate` — must be self-contained. Pulls name,
 * description, counts, and owner from the list header.
 */
function extractListHeaderFromDom(): {
  name: string;
  description: string;
  memberCount: string;
  subscriberCount: string;
  ownerHandle: string;
  ownerDisplayName: string;
} | null {
  const col = document.querySelector('[data-testid="primaryColumn"]');
  if (!col) return null;
  // List header h2 typically holds the name. Description is the
  // following paragraph-ish span. Member/Subscriber counts are
  // labelled links under the header.
  const nameEl = col.querySelector('h2');
  const name = nameEl?.textContent?.trim() ?? '';
  const spans = Array.from(col.querySelectorAll('span'))
    .map((s) => s.textContent?.trim() ?? '')
    .filter(Boolean);
  const memberCount =
    spans.find((s) => /^[\d.,]+\s*(member|üye)/i.test(s))?.match(/[\d.,]+/)?.[0] ?? '';
  const subscriberCount =
    spans.find((s) => /^[\d.,]+\s*(subscriber|abone)/i.test(s))?.match(/[\d.,]+/)?.[0] ?? '';
  // Owner is rendered as an avatar link to /<handle> — pick the first.
  const ownerLink = Array.from(col.querySelectorAll('a[href^="/"]')).find((a) => {
    const path = (a as HTMLAnchorElement).pathname.split('/').filter(Boolean);
    return (
      path.length === 1 &&
      !['i', 'home', 'explore', 'notifications', 'messages'].includes(path[0])
    );
  }) as HTMLAnchorElement | undefined;
  const ownerHandle = ownerLink?.pathname.replace('/', '') ?? '';
  const ownerDisplayName = ownerLink?.querySelector('span')?.textContent?.trim() ?? '';
  const description =
    spans.find((s) => s !== name && s.length > 8 && !/member|subscriber|üye|abone/i.test(s)) ?? '';
  return { name, description, memberCount, subscriberCount, ownerHandle, ownerDisplayName };
}
