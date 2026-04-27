import { config } from '../config';
import { fetchTrending } from '../sources/githubTrending';
import { generateTweet } from '../ai/openrouter';
import * as posted from '../storage/posted';
import * as queue from '../storage/queue';
import type { EnqueueInput } from '../storage/queue';
import type { QueueItem } from '../types';
import { make } from '../utils/logger';

const log = make('collect');

export function buildSchedule(count: number, baseDate: Date = new Date()): Date[] {
  const start = new Date(baseDate);
  start.setSeconds(0, 0);
  start.setHours(config.pipeline.dispatchStartHour, 30, 0, 0);

  const now = new Date();
  if (start < now) {
    const ms = config.pipeline.dispatchIntervalMin * 60 * 1000;
    const diff = now.getTime() - start.getTime();
    const slots = Math.ceil(diff / ms);
    start.setTime(start.getTime() + slots * ms);
  }

  const slots: Date[] = [];
  const stepMs = config.pipeline.dispatchIntervalMin * 60 * 1000;
  for (let i = 0; i < count; i++) {
    slots.push(new Date(start.getTime() + i * stepMs));
  }
  return slots;
}

export async function run(): Promise<QueueItem[]> {
  log.info('Başladı');
  const trending = await fetchTrending({ since: 'daily' });
  log.info(`GitHub Trending: ${trending.length} repo`);

  const postedSlugs = new Set(posted.load().items.map((it) => it.repo.toLowerCase()));
  const queuedSlugs = new Set(queue.pendingRepoSlugs());

  const candidates = trending.filter(
    (r) => !postedSlugs.has(r.slug.toLowerCase()) && !queuedSlugs.has(r.slug.toLowerCase())
  );
  log.info(`Dedup sonrası: ${candidates.length} aday`);

  const target = Math.min(config.pipeline.tweetsPerDay, candidates.length);
  if (target === 0) {
    log.warn('Tweet üretilecek yeni repo yok.');
    return [];
  }

  const slots = buildSchedule(target);
  const created: EnqueueInput[] = [];

  for (let i = 0; i < target; i++) {
    const repo = candidates[i];
    try {
      const text = await generateTweet(repo);
      created.push({
        repo: repo.slug,
        url: repo.url,
        text,
        scheduledAt: slots[i].toISOString(),
      });
      log.ok(`(${i + 1}/${target}) ${repo.slug} — ${text.length} char`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`${repo.slug} için tweet üretilemedi: ${msg}`);
    }
  }

  if (created.length === 0) {
    log.warn('Hiçbir tweet üretilemedi.');
    return [];
  }

  const enqueued = queue.enqueue(created);
  log.ok(`${enqueued.length} tweet kuyruğa eklendi.`);
  return enqueued;
}

if (require.main === module) {
  run().catch((e) => {
    log.error(e);
    process.exit(1);
  });
}
