import type { Page } from 'patchright';
import {
  type CursorKind,
  type CursorPayload,
  type PaginatedResult,
  decodeCursor,
  encodeCursor,
} from './pagination.util';
import type { TweetResult, UserListItem } from './x-direct.types';

/**
 * DOM-side helpers for cursor-paginated read endpoints. Pulled out of
 * XDirectReadService to keep the service file under the max-lines lint cap
 * once cursor support landed across 13 methods.
 *
 * Pagination model: opaque cursors carry the last item's stable identity
 * (tweet URL or handle) plus a scroll-depth hint. Resuming a paginated read
 * navigates to the same URL, pre-scrolls to the depth hint, then scans for
 * the cursor key and starts collecting AFTER it.
 */

export interface TweetSelectors {
  tweetArticle: string;
  tweetText: string;
  userNames: string;
  tweetLikeCount: string;
  tweetRetweetCount: string;
  tweetReplyCount: string;
}

export interface UserCellSelectors {
  userCell: string;
  userName: string;
  userDescription: string;
  verifiedIcon: string;
}

const SCROLL_PIXELS = 3000;
const SCROLL_WAIT_MS = 1500;
const PRESCROLL_WAIT_MS = 800;
const EXTRACT_BATCH = 200;
const MAX_SCROLL_ITERATIONS = 30;
const MAX_STALL = 3;

export async function extractTweetsFromPage(
  page: Page,
  sel: TweetSelectors,
  cap: number,
  sanitize: (text: string) => string,
): Promise<TweetResult[]> {
  const raw = await page.evaluate((params) => {
    const articles = Array.from(document.querySelectorAll(params.tweetArticle)).slice(0, params.cap);
    return articles.map((a) => {
      const text = a.querySelector(params.tweetText)?.textContent ?? '';
      const nameEl = a.querySelector(params.userNames);
      const displayName = nameEl?.textContent ?? '';
      const timeEl = a.querySelector('time');
      const postedAt = timeEl?.getAttribute('datetime') ?? '';
      const tweetLink = a.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
      const url = tweetLink?.href ?? '';
      const handle = tweetLink?.pathname?.split('/').filter(Boolean)[0] ?? '';
      const likeEl = a.querySelector(params.likeCount);
      const rtEl = a.querySelector(params.retweetCount);
      const replyEl = a.querySelector(params.replyCount);
      return {
        url,
        text,
        handle,
        displayName,
        likeCount: likeEl?.textContent ?? '0',
        retweetCount: rtEl?.textContent ?? '0',
        replyCount: replyEl?.textContent ?? '0',
        postedAt,
      };
    });
  }, {
    cap,
    tweetArticle: sel.tweetArticle,
    tweetText: sel.tweetText,
    userNames: sel.userNames,
    likeCount: sel.tweetLikeCount,
    retweetCount: sel.tweetRetweetCount,
    replyCount: sel.tweetReplyCount,
  });
  return raw.map((t) => ({
    ...t,
    text: sanitize(t.text),
    displayName: sanitize(t.displayName),
  }));
}

export async function extractUsersFromPage(
  page: Page,
  sel: UserCellSelectors,
  cap: number,
): Promise<UserListItem[]> {
  return page.evaluate((params) => {
    const cells = Array.from(document.querySelectorAll(params.userCell)).slice(0, params.cap);
    return cells
      .map((cell) => {
        const nameEl = cell.querySelector(params.userName);
        const spans = Array.from(nameEl?.querySelectorAll('span') ?? [])
          .map((span) => span.textContent?.trim() ?? '')
          .filter(Boolean);
        const handle =
          extractHandleFromCell(cell) ??
          spans.find((text) => text.startsWith('@'))?.replace('@', '') ??
          '';
        const displayName = spans.find((text) => !text.startsWith('@') && text !== '·') ?? '';
        const bio = cell.querySelector(params.userDescription)?.textContent ?? '';
        const verified = Boolean(cell.querySelector(params.verifiedIcon));
        return { handle, displayName, bio, verified };
      })
      .filter((user) => user.handle || user.displayName || user.bio);

    function extractHandleFromCell(cell: Element): string | null {
      const links = Array.from(
        cell.querySelectorAll('a[href^="/"], a[href^="https://x.com/"]'),
      ) as HTMLAnchorElement[];
      for (const link of links) {
        const parts = new URL(link.href, location.origin).pathname.split('/').filter(Boolean);
        const candidate = parts.length === 1 ? parts[0] : '';
        if (candidate && !['home', 'i', 'intent', 'search', 'settings'].includes(candidate)) {
          return candidate;
        }
      }
      return null;
    }
  }, {
    cap,
    userCell: sel.userCell,
    userName: sel.userName,
    userDescription: sel.userDescription,
    verifiedIcon: sel.verifiedIcon,
  });
}

export async function paginateTweets(
  page: Page,
  sel: TweetSelectors,
  limit: number,
  cursorStr: string | undefined,
  sanitize: (text: string) => string,
): Promise<PaginatedResult<TweetResult>> {
  const cursor = parseCursor(cursorStr, 'tweet-list');
  return paginate<TweetResult>(
    page,
    limit,
    cursor,
    (item) => item.url,
    'tweet-list',
    () => extractTweetsFromPage(page, sel, EXTRACT_BATCH, sanitize),
  );
}

export async function paginateUsers(
  page: Page,
  sel: UserCellSelectors,
  limit: number,
  cursorStr: string | undefined,
  options: { verifiedOnly?: boolean },
): Promise<PaginatedResult<UserListItem>> {
  const cursor = parseCursor(cursorStr, 'user-list');
  return paginate<UserListItem>(
    page,
    limit,
    cursor,
    (item) => item.handle,
    'user-list',
    async () => {
      const all = await extractUsersFromPage(page, sel, EXTRACT_BATCH);
      return options.verifiedOnly ? all.filter((u) => u.verified) : all;
    },
  );
}

function parseCursor(raw: string | undefined, kind: CursorKind): CursorPayload | null {
  if (!raw) return null;
  return decodeCursor(raw, kind);
}

async function paginate<T>(
  page: Page,
  limit: number,
  cursor: CursorPayload | null,
  keyFn: (item: T) => string,
  kind: CursorKind,
  extract: () => Promise<T[]>,
): Promise<PaginatedResult<T>> {
  const initialDepth = cursor?.depth ?? 0;
  for (let i = 0; i < initialDepth; i++) {
    await page.evaluate((px) => window.scrollBy(0, px), SCROLL_PIXELS);
    await page.waitForTimeout(PRESCROLL_WAIT_MS);
  }

  let depth = initialDepth;
  let needSkipPast: string | null = cursor?.key ?? null;
  const collected: T[] = [];
  const seen = new Set<string>();
  let stall = 0;
  let lastSize = -1;

  for (let iter = 0; iter < MAX_SCROLL_ITERATIONS; iter++) {
    const all = await extract();

    let candidates: T[];
    if (needSkipPast) {
      const idx = all.findIndex((item) => keyFn(item) === needSkipPast);
      if (idx >= 0) {
        candidates = all.slice(idx + 1);
        needSkipPast = null;
      } else {
        candidates = [];
      }
    } else {
      candidates = all;
    }

    for (const item of candidates) {
      const k = keyFn(item);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      collected.push(item);
      if (collected.length >= limit) break;
    }

    if (collected.length >= limit) break;

    if (collected.length === lastSize && !needSkipPast) {
      stall++;
      if (stall >= MAX_STALL) break;
    } else {
      stall = 0;
    }
    lastSize = collected.length;

    await page.evaluate((px) => window.scrollBy(0, px), SCROLL_PIXELS);
    await page.waitForTimeout(SCROLL_WAIT_MS);
    depth++;
  }

  const items = collected.slice(0, limit);
  const nextCursor =
    items.length === limit && items.length > 0
      ? encodeCursor({ k: kind, key: keyFn(items[items.length - 1]), depth })
      : null;
  return { items, nextCursor };
}
