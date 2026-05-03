/**
 * Cursor-based pagination for DOM-scraped X.com surfaces.
 *
 * X doesn't expose stable server-side cursors to non-API clients, so our
 * cursor is the identity of the last item we returned plus a scroll-depth
 * hint. The next call re-renders the page, scrolls past `depth` viewports,
 * and starts collecting items AFTER the one whose key matches `key`.
 *
 * Cursors are opaque base64url JSON: callers must not parse or construct
 * them, only echo the value back as-is.
 */

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}

export type CursorKind = 'tweet-list' | 'user-list';

/**
 * Number of recent keys we carry forward in the cursor for cross-page
 * dedup. X profile timelines re-order content between page loads (ads,
 * pinned posts, suggested follows), so a tweet that was on page 1 can
 * resurface in page 2's render. We exclude keys we've already returned
 * to the caller. Cap at 50 to keep encoded cursor < ~5 KB.
 */
export const SEEN_LIST_CAP = 50;

export interface CursorPayload {
  v: 1;
  k: CursorKind;
  /** Last item's stable identity: tweet URL for tweet-list, handle for user-list. */
  key: string;
  /** Approximate scroll-down count from last call (hint, not enforced). */
  depth: number;
  /** Recently-returned keys to dedupe against on the next page. Capped. */
  seen?: string[];
}

export function encodeCursor(payload: Omit<CursorPayload, 'v'>): string {
  const seen = payload.seen ? payload.seen.slice(-SEEN_LIST_CAP) : undefined;
  const full: CursorPayload = { v: 1, ...payload, ...(seen ? { seen } : {}) };
  return Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string, expectedKind: CursorKind): CursorPayload {
  let parsed: unknown;
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new Error('invalid cursor: not base64url JSON');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as { v?: unknown }).v !== 1 ||
    typeof (parsed as { key?: unknown }).key !== 'string' ||
    typeof (parsed as { depth?: unknown }).depth !== 'number'
  ) {
    throw new Error('invalid cursor: missing fields');
  }
  const p = parsed as CursorPayload;
  if (p.k !== expectedKind) {
    throw new Error(`invalid cursor: expected kind '${expectedKind}', got '${p.k}'`);
  }
  if (p.seen !== undefined && (!Array.isArray(p.seen) || p.seen.some((s) => typeof s !== 'string'))) {
    throw new Error('invalid cursor: seen must be string[]');
  }
  return p;
}

export function emptyPage<T>(): PaginatedResult<T> {
  return { items: [], nextCursor: null };
}
