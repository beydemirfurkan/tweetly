import { config } from '../config';
import { fetchTrending } from '../sources/githubTrending';
import { generateTweet } from '../ai/openrouter';
import * as posted from '../storage/posted';
import * as queue from '../storage/queue';
import * as contentMemory from '../storage/contentMemory';
import type { EnqueueInput } from '../storage/queue';
import type { QueueItem } from '../types';
import { make } from '../utils/logger';

const log = make('collect');
const STYLE_HINTS = [
  'tek cümleyle doğrudan ne işe yaradığını anlat, link etiketini github: yap',
  'kısa bir problem/çözüm çerçevesi kur, link etiketini kaynak: yap',
  'geliştiriciye faydasını öne çıkar, linki direkt URL olarak ver',
  'tooling/workflow açısından neden pratik olduğunu anlat, link etiketini repo: yap',
  'abartısız bir gözlem cümlesiyle başla, önceki kalıpları tekrar etme',
];

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function startOfLocalDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

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
  const jitterMinMs = config.pipeline.scheduleJitterMin * 60 * 1000;
  const jitterMaxMs = config.pipeline.scheduleJitterMax * 60 * 1000;
  let cursor = start.getTime() + randomInt(0, config.pipeline.scheduleJitterMax) * 60 * 1000;

  for (let i = 0; i < count; i++) {
    slots.push(new Date(cursor));
    cursor += stepMs + randomInt(jitterMinMs, jitterMaxMs);
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

  const postedToday = posted.countSince(startOfLocalDay());
  const activeQueued = queue.summary().active;
  const remainingToday = Math.max(0, config.pipeline.tweetsPerDay - postedToday - activeQueued);
  const target = Math.min(remainingToday, candidates.length);
  log.info(`Günlük limit: ${postedToday} atıldı, ${activeQueued} aktif, ${remainingToday} kalan.`);

  if (target === 0) {
    log.warn('Tweet üretilecek slot veya yeni repo yok.');
    return [];
  }

  const slots = buildSchedule(target);
  const created: EnqueueInput[] = [];

  for (let i = 0; i < target; i++) {
    const repo = candidates[i];
    try {
      let text = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        const styleHint = STYLE_HINTS[(i + attempt) % STYLE_HINTS.length];
        text = await generateTweet(repo, styleHint);
        const reason = contentMemory.similarityReason(text);
        if (!reason) break;
        log.warn(`${repo.slug} için benzer tweet elendi (${attempt + 1}/3): ${reason}`);
        text = '';
      }

      if (!text) {
        throw new Error('Benzer olmayan tweet üretilemedi');
      }

      created.push({
        repo: repo.slug,
        url: repo.url,
        text,
        scheduledAt: slots[i].toISOString(),
      });
      contentMemory.add(repo.slug, text);
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
