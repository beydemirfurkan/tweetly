import { paginateTweets } from '../read-page.utils';
import type { PaginatedResult } from '../pagination.util';
import type { ListMetaItem, TweetResult, UserListItem, UserResult } from '../x-direct.types';
import { searchTweets } from './search.ops';
import type { XDirectReadCtx } from './context';

export async function getUserTweets(
  ctx: XDirectReadCtx,
  handle: string,
  limit: number,
  accountId: string | undefined,
  cursor: string | undefined,
): Promise<PaginatedResult<TweetResult>> {
  const cleanHandle = handle.replace(/^@/, '');
  return ctx.withSession('getUserTweets', accountId, async (page, acctId) => {
    await page.goto(`https://x.com/${cleanHandle}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await ctx.browser.assertSessionHealthy(page, acctId);
    try {
      await page.waitForSelector(ctx.sel.tweetArticle, { timeout: 15_000 });
    } catch {
      return { items: [], nextCursor: null };
    }
    await page.waitForTimeout(1_500);
    return paginateTweets(page, ctx.tweetSel(), limit, cursor, (s) => ctx.sanitizeText(s));
  });
}

export function getUserFollowers(
  ctx: XDirectReadCtx,
  handle: string,
  limit: number,
  accountId: string | undefined,
  cursor: string | undefined,
  options: { verifiedOnly?: boolean },
): Promise<PaginatedResult<UserListItem>> {
  return ctx.scrapeUserList(`https://x.com/${handle}/followers`, limit, accountId, cursor, options);
}

export function getUserFollowing(
  ctx: XDirectReadCtx,
  handle: string,
  limit: number,
  accountId: string | undefined,
  cursor: string | undefined,
  options: { verifiedOnly?: boolean },
): Promise<PaginatedResult<UserListItem>> {
  return ctx.scrapeUserList(`https://x.com/${handle}/following`, limit, accountId, cursor, options);
}

export function getMutualFollowers(
  ctx: XDirectReadCtx,
  handle: string,
  limit: number,
  accountId: string | undefined,
  cursor: string | undefined,
  options: { verifiedOnly?: boolean },
): Promise<PaginatedResult<UserListItem>> {
  const cleanHandle = handle.replace(/^@/, '');
  return ctx.scrapeUserList(
    `https://x.com/${cleanHandle}/followers_you_follow`,
    limit,
    accountId,
    cursor,
    options,
  );
}

export function getUserMentions(
  ctx: XDirectReadCtx,
  handle: string,
  limit: number,
  accountId: string | undefined,
  cursor: string | undefined,
): Promise<PaginatedResult<TweetResult>> {
  const cleanHandle = handle.replace(/^@/, '');
  return searchTweets(ctx, `@${cleanHandle}`, limit, accountId, cursor);
}

export async function getUserLikes(
  ctx: XDirectReadCtx,
  handle: string,
  limit: number,
  accountId: string | undefined,
  cursor: string | undefined,
): Promise<PaginatedResult<TweetResult>> {
  const cleanHandle = handle.replace(/^@/, '');
  return ctx.withSession('getUserLikes', accountId, async (page, acctId) => {
    await page.goto(`https://x.com/${cleanHandle}/likes`, {
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

export async function getUserLists(
  ctx: XDirectReadCtx,
  handle: string,
  accountId: string | undefined,
): Promise<ListMetaItem[]> {
  const cleanHandle = handle.replace(/^@/, '');
  return ctx.withSession('getUserLists', accountId, async (page, acctId) => {
    await page.goto(`https://x.com/${cleanHandle}/lists`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await ctx.browser.assertSessionHealthy(page, acctId);
    // X's lists page renders each list as a link to /i/lists/<id>; if
    // the user has none, there's nothing to wait for and we return empty.
    try {
      await page.waitForSelector('a[href*="/i/lists/"]', { timeout: 8_000 });
    } catch {
      return [];
    }
    await page.waitForTimeout(1_500);

    const raw = await page.evaluate(() => {
      const seen = new Set<string>();
      const items: Array<{
        listId: string;
        name: string;
        description: string;
        memberCount: string;
        ownerHandle: string;
        url: string;
      }> = [];
      const links = Array.from(
        document.querySelectorAll('a[href*="/i/lists/"]'),
      ) as HTMLAnchorElement[];
      for (const link of links) {
        const m = link.pathname.match(/\/i\/lists\/(\d+)(?:$|\/)/);
        if (!m) continue;
        const listId = m[1];
        if (seen.has(listId)) continue;
        seen.add(listId);
        // Find the enclosing card. The list card on X usually wraps
        // multiple spans for name + member count; we grab the
        // closest container with > 1 line of text.
        let card: Element = link;
        for (let i = 0; i < 5 && card.parentElement; i++) {
          card = card.parentElement;
          if ((card.textContent ?? '').trim().split('\n').filter(Boolean).length >= 2) break;
        }
        const spans = Array.from(card.querySelectorAll('span'))
          .map((s) => s.textContent?.trim() ?? '')
          .filter(Boolean);
        // Heuristic: first non-numeric, non-"@handle" span = name; the
        // span containing "member"/"üye" = memberCount; the @-prefixed
        // span = ownerHandle; the last long span = description.
        const name = spans.find((s) => !/^@/.test(s) && !/member|üye/i.test(s)) ?? '';
        const memberCount =
          spans.find((s) => /^[\d.,]+\s*(member|üye)/i.test(s))?.match(/[\d.,]+/)?.[0] ?? '';
        const ownerHandle = (spans.find((s) => /^@/.test(s)) ?? '').replace(/^@/, '');
        const description =
          spans.filter((s) => s !== name && !/^@/.test(s) && !/member|üye/i.test(s)).join(' ');
        items.push({
          listId,
          name,
          description,
          memberCount,
          ownerHandle,
          url: `https://x.com/i/lists/${listId}`,
        });
      }
      return items;
    });

    return raw.map((item) => ({
      ...item,
      name: ctx.sanitizeText(item.name),
      description: ctx.sanitizeText(item.description),
    }));
  });
}

export async function getUser(
  ctx: XDirectReadCtx,
  handle: string,
  accountId: string | undefined,
): Promise<UserResult> {
  return ctx.withSession('getUser', accountId, async (page) => {
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(5_000);

    const raw = await page.evaluate(extractUserFromDom, {
      userName: ctx.sel.userName,
      userDescription: ctx.sel.userDescription,
      userFollowersCount: ctx.sel.userFollowersCount,
      userFollowingCount: ctx.sel.userFollowingCount,
      userProfileImage: ctx.sel.userProfileImage,
      verifiedIcon: ctx.sel.verifiedIcon,
      handle,
    });
    return {
      ...raw,
      displayName: ctx.sanitizeText(raw.displayName),
      bio: ctx.sanitizeText(raw.bio),
    };
  });
}

/**
 * Runs inside `page.evaluate` — must be a self-contained function the browser
 * can serialize. Extracted so the calling op stays under the function-length
 * lint cap and so the parsing logic can be reasoned about on its own.
 */
function extractUserFromDom(params: {
  userName: string;
  userDescription: string;
  userFollowersCount: string;
  userFollowingCount: string;
  userProfileImage: string;
  verifiedIcon: string;
  handle: string;
}): UserResult {
  const nameEl = document.querySelector(params.userName);
  const bioEl = document.querySelector(params.userDescription);
  const followersEl = document.querySelector(params.userFollowersCount);
  const followingEl = document.querySelector(params.userFollowingCount);
  const verifiedEl = document.querySelector(params.verifiedIcon);
  const avatarEl = document.querySelector(params.userProfileImage) as HTMLImageElement | null;

  const fullName = nameEl?.querySelector('span')?.textContent ?? '';
  const handleEl = nameEl?.querySelectorAll('span')?.[1];
  const rawHandle = handleEl?.textContent?.replace('@', '') ?? params.handle;

  // Modern X profile renders the post count as a small header line
  // under the back-arrow ("112 posts" / "112 gönderi"), NOT inside
  // any tab link. Scope to primaryColumn (the profile column) and
  // pick the first leaf-ish element whose trimmed text exactly
  // matches "<number> posts|gönderi".
  let tweetsCount = '';
  const tweetCountFullRe = /^[\d.,]+\s*[KkMmBb]?\s+(?:posts?|gönderi)$/iu;
  const tweetCountNumRe = /^([\d.,]+\s*[KkMmBb]?)/;
  const scopeEl = document.querySelector('[data-testid="primaryColumn"]') ?? document.body;
  const candidates = scopeEl.querySelectorAll('span, div, h1, h2');
  for (const el of candidates) {
    const text = (el.textContent ?? '').trim();
    if (text.length === 0 || text.length > 30) continue;
    if (!tweetCountFullRe.test(text)) continue;
    const numMatch = text.match(tweetCountNumRe);
    if (numMatch) {
      tweetsCount = numMatch[1].trim();
      break;
    }
  }

  if (!tweetsCount) {
    const profileHandle = `/${rawHandle}`;
    const allStatLinks = document.querySelectorAll(
      `a[href="${profileHandle}"], a[href="${profileHandle}/"]`,
    );
    for (const link of allStatLinks) {
      const text = link.textContent ?? '';
      if (text.match(/gönderi|posts/i)) {
        const numMatch = text.match(/([\d.,]+\s*[KkMmBb]?)/);
        if (numMatch) {
          tweetsCount = numMatch[1].trim();
          break;
        }
      }
    }
  }

  const profileImageUrl = avatarEl?.src ?? '';

  return {
    handle: rawHandle,
    displayName: fullName,
    bio: bioEl?.textContent ?? '',
    followersCount: followersEl?.textContent ?? '0',
    followingCount: followingEl?.textContent ?? '0',
    tweetsCount: tweetsCount || '0',
    verified: Boolean(verifiedEl),
    profileUrl: `https://x.com/${rawHandle}`,
    profileImageUrl,
  };
}
