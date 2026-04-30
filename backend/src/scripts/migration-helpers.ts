import * as crypto from 'crypto';

export function sha8(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);
}

export function hourBucket(iso: string): string {
  return iso.slice(0, 13);
}

export type LegacyTweetStatus = 'pending' | 'sent' | 'failed' | 'dead';
export type ActionStatus = 'pending' | 'succeeded' | 'failed' | 'dead';

export function statusMap(s: LegacyTweetStatus): ActionStatus {
  return s === 'sent' ? 'succeeded' : s;
}

export function extractTweetIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/status\/(\d+)/);
  return m ? m[1] : null;
}

export function buildPostKey(accountId: string, text: string, createdAtIso: string): string {
  return `post:${accountId}:${sha8(text)}:${hourBucket(createdAtIso)}`;
}

export function buildReplyKey(accountId: string, parentTweetId: string, text: string): string {
  return `reply:${accountId}:${parentTweetId}:${sha8(text)}`;
}

export function parseControlStateKey(rawKey: string): { accountId: string; field: string } {
  const sep = rawKey.indexOf(':');
  if (sep <= 0) return { accountId: '', field: rawKey };
  return { accountId: rawKey.slice(0, sep), field: rawKey.slice(sep + 1) };
}

export function inferActionType(eventType: string): 'post' | 'reply' | null {
  if (eventType.startsWith('reply_')) return 'reply';
  if (eventType.startsWith('post_')) return 'post';
  return null;
}
