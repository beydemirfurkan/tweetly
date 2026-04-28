import * as queue from '../storage/queue';
import * as posted from '../storage/posted';
import * as control from '../storage/control';
import * as analytics from '../storage/analytics';
import * as accounts from '../storage/accounts';
import { get } from '../storage/settings';
import { isAuthRequiredError, postTweet, postReply, type PostResult } from '../core/postTweet';
import { cleanupMediaFile } from '../core/media';
import type { QueueItem } from '../types';
import type { AnalyticsEvent } from '../storage/analytics';
import { make } from '../utils/logger';

const log = make('dispatch');
const AUTH_RETRY_MIN = 5;
const DISPATCH_INTERVAL_SETTING = 'dispatch_interval_min';
const REPLY_DELAY_SETTING = 'reply_delay_ms';
const MAX_ATTEMPTS_SETTING = 'max_attempts';

let running = false;

function label(accountId?: string): string {
  return accountId ?? 'default';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type EventExtras = Partial<Omit<AnalyticsEvent, 'id' | 'timestamp' | 'type' | 'repo'>>;

function buildEvent(
  item: QueueItem,
  type: AnalyticsEvent['type'],
  extras?: EventExtras
): Omit<AnalyticsEvent, 'id' | 'timestamp'> {
  return {
    type,
    format: item.format,
    objective: item.objective,
    repo: item.repo,
    topic: item.topic,
    source: item.source,
    accountId: item.accountId,
    ...extras,
  };
}

function markSent(item: QueueItem, tweetId: string, tweetUrl: string): void {
  queue.update(item.id, {
    status: 'sent',
    sentAt: new Date().toISOString(),
    tweetId: tweetId || undefined,
    tweetUrl: tweetUrl || undefined,
  });
  posted.add(item.repo);
  cleanupMediaFile(item.mediaPath);
}

function markFailed(item: QueueItem, errorMsg: string, overrideStatus?: 'failed' | 'dead'): void {
  const attempts = (item.attempts ?? 0) + 1;
  const maxAttempts = get<number>(MAX_ATTEMPTS_SETTING, 3);
  const status = overrideStatus ?? (attempts >= maxAttempts ? 'dead' : 'failed');

  queue.update(item.id, {
    status,
    attempts,
    lastError: errorMsg,
    lastTriedAt: new Date().toISOString(),
  });
}

function recordPostSuccess(
  item: QueueItem,
  result: PostResult,
  durationMs: number,
  eventType: AnalyticsEvent['type']
): void {
  markSent(item, result.tweetId, result.tweetUrl);
  analytics.recordEvent(buildEvent(item, eventType, {
    tweetId: result.tweetId || undefined,
    tweetUrl: result.tweetUrl || undefined,
    durationMs,
  }));
}

function recordPostFailure(
  item: QueueItem,
  errorMsg: string,
  durationMs: number,
  eventType: AnalyticsEvent['type']
): void {
  analytics.recordEvent(buildEvent(item, eventType, { durationMs, errorMessage: errorMsg }));
}

interface PostEventTypes {
  success: AnalyticsEvent['type'];
  failure: AnalyticsEvent['type'];
}

/**
 * Times the post action, records analytics for success or failure, and rethrows on failure.
 * Caller decides whether to mark the item failed / trigger circuit breaker.
 */
async function attemptPost(
  item: QueueItem,
  action: () => Promise<PostResult>,
  events: PostEventTypes
): Promise<{ result: PostResult; durationMs: number }> {
  const start = Date.now();
  try {
    const result = await action();
    const durationMs = Date.now() - start;
    recordPostSuccess(item, result, durationMs, events.success);
    return { result, durationMs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - start;
    recordPostFailure(item, msg, durationMs, events.failure);
    throw err;
  }
}

function canDispatch(accountId?: string): { blocked: boolean; reason?: string } {
  if (control.isPaused(accountId)) {
    const state = control.load(accountId);
    return {
      blocked: true,
      reason: `@${label(accountId)} paused: ${state.reason ?? 'unknown'}${state.pauseUntil ? ` (${state.pauseUntil})` : ''}`,
    };
  }

  const latestSentAt = queue.summary(accountId).latestSentAt;
  if (latestSentAt) {
    const intervalMin = get<number>(DISPATCH_INTERVAL_SETTING, 30);
    const allowedAt = new Date(new Date(latestSentAt).getTime() + intervalMin * 60 * 1000);
    if (allowedAt > new Date()) {
      return {
        blocked: true,
        reason: `@${label(accountId)} minimum aralik bekleniyor, siradaki: ${allowedAt.toISOString()}`,
      };
    }
  }

  return { blocked: false };
}

async function dispatchSingle(item: QueueItem): Promise<string | null> {
  const { result, durationMs } = await attemptPost(
    item,
    () => postTweet(item.text, item.accountId, item.mediaPath),
    { success: 'post_success', failure: 'post_failure' }
  );

  const idLabel = result.tweetId ? ` (id=${result.tweetId})` : '';
  log.ok(`Atildi: @${label(item.accountId)} ${item.repo}${idLabel} [${item.format ?? 'unknown'}] ${durationMs}ms`);
  return result.tweetUrl || null;
}

async function dispatchReplies(parent: QueueItem, parentUrl: string): Promise<void> {
  const replies = queue.getPendingReplies(parent.id);
  if (replies.length === 0) return;

  log.info(`${parent.repo} icin ${replies.length} reply bulundu.`);
  const delayMs = get<number>(REPLY_DELAY_SETTING, 10000);

  for (const reply of replies) {
    await sleep(delayMs);
    const fresh = queue.update(reply.id, {});
    if (!fresh || fresh.status !== 'pending') continue;

    try {
      const { durationMs } = await attemptPost(
        fresh,
        () => postReply(parentUrl, fresh.text, fresh.accountId),
        { success: 'reply_success', failure: 'reply_failure' }
      );
      log.ok(`Reply atildi: @${label(fresh.accountId)} ${fresh.repo} → ${parentUrl} ${durationMs}ms`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      markFailed(fresh, msg);
      log.error(`Reply hata: ${msg}`);
      break;
    }
  }
}

function handleAuthError(item: QueueItem, msg: string, accountId?: string): void {
  const retryAt = new Date(Date.now() + AUTH_RETRY_MIN * 60 * 1000).toISOString();
  queue.update(item.id, {
    status: 'failed',
    lastError: msg,
    lastTriedAt: new Date().toISOString(),
    scheduledAt: retryAt,
  });
  control.recordFailure(msg, accountId);
  log.warn(`@${label(accountId)} Auth gerekli. ${item.repo} ${retryAt} icin ertelendi.`);
}

function handleGenericError(item: QueueItem, msg: string, accountId?: string): void {
  markFailed(item, msg);
  const state = control.recordFailure(msg, accountId);
  if (state.paused) {
    log.error(`@${label(accountId)} Circuit breaker: ${state.reason}. ${state.pauseUntil} kadar duraklatildi.`);
  } else {
    log.error(`@${label(accountId)} Hata (${(item.attempts ?? 0) + 1}): ${msg}`);
  }
}

function handlePostError(item: QueueItem, err: unknown, accountId?: string): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (isAuthRequiredError(err)) {
    handleAuthError(item, msg, accountId);
  } else {
    handleGenericError(item, msg, accountId);
  }
}

async function runForAccount(accountId?: string): Promise<QueueItem | null> {
  const guard = canDispatch(accountId);
  if (guard.blocked) {
    log.warn(guard.reason!);
    return null;
  }

  const item = queue.dueNext(accountId);
  if (!item) return null;

  log.info(`Atiliyor: @${label(accountId)} ${item.repo} (id=${item.id}) [${item.format ?? 'unknown'}]`);

  try {
    const tweetUrl = await dispatchSingle(item);
    control.recordSuccess(accountId);
    if (tweetUrl) await dispatchReplies(item, tweetUrl);
    return item;
  } catch (err) {
    handlePostError(item, err, accountId);
    return null;
  }
}

export async function run(): Promise<QueueItem | null> {
  if (running) {
    log.warn('Onceki dispatch hala calisiyor, atlaniyor.');
    return null;
  }
  running = true;
  try {
    const active = accounts.getActive();

    if (active.length <= 1) {
      return runForAccount(active[0]?.id);
    }

    for (const account of active) {
      const item = await runForAccount(account.id);
      if (item) return item;
    }

    log.info('Hesaplarin hicbirinde vakti gelen tweet yok.');
    return null;
  } finally {
    running = false;
  }
}

if (require.main === module) {
  run().catch((e) => {
    log.error(e);
    process.exit(1);
  });
}
