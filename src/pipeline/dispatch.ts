import { config } from '../config';
import * as queue from '../storage/queue';
import * as posted from '../storage/posted';
import * as control from '../storage/control';
import { isAuthRequiredError, postTweet } from '../core/postTweet';
import type { QueueItem } from '../types';
import { make } from '../utils/logger';

const log = make('dispatch');

let running = false;

function nextAllowedPostAt(): Date | null {
  const latestSentAt = queue.summary().latestSentAt;
  if (!latestSentAt) return null;
  return new Date(new Date(latestSentAt).getTime() + config.pipeline.dispatchIntervalMin * 60 * 1000);
}

export async function run(): Promise<QueueItem | null> {
  if (running) {
    log.warn('Önceki dispatch hâlâ çalışıyor, atlanıyor.');
    return null;
  }
  running = true;
  try {
    if (control.isPaused()) {
      const state = control.load();
      log.warn(`Bot paused: ${state.reason ?? 'unknown'}${state.pauseUntil ? ` (${state.pauseUntil} kadar)` : ''}`);
      return null;
    }

    const allowedAt = nextAllowedPostAt();
    if (allowedAt && allowedAt > new Date()) {
      log.info(`Son tweetten sonra minimum aralık bekleniyor. Sıradaki deneme: ${allowedAt.toISOString()}`);
      return null;
    }

    const item = queue.dueNext();
    if (!item) {
      log.info('Vakti gelen tweet yok.');
      return null;
    }

    log.info(`Atılıyor: ${item.repo} (id=${item.id})`);
    try {
      await postTweet(item.text);
      queue.update(item.id, { status: 'sent', sentAt: new Date().toISOString() });
      posted.add(item.repo);
      control.recordSuccess();
      log.ok(`Atıldı: ${item.repo}`);
      return item;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isAuthRequiredError(err)) {
        const retryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        queue.update(item.id, {
          status: 'failed',
          lastError: msg,
          lastTriedAt: new Date().toISOString(),
          scheduledAt: retryAt,
        });
        control.recordFailure(msg);
        log.warn(`Auth gerekli, attempt artırılmadı. ${item.repo} ${retryAt} için ertelendi.`);
        return null;
      }

      const attempts = (item.attempts || 0) + 1;
      const status: 'failed' | 'dead' =
        attempts >= config.pipeline.maxAttempts ? 'dead' : 'failed';
      queue.update(item.id, {
        status,
        attempts,
        lastError: msg,
        lastTriedAt: new Date().toISOString(),
      });
      const state = control.recordFailure(msg);
      if (state.paused) {
        log.error(`Circuit breaker açıldı: ${state.reason}. ${state.pauseUntil} kadar duraklatıldı.`);
      }
      log.error(`Hata (${status}, deneme ${attempts}): ${msg}`);
      return null;
    }
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
