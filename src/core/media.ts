import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';
import type { TrendingRepo } from '../types';
import { make } from '../utils/logger';

const log = make('media');
const MEDIA_DIR = path.join(config.paths.data, 'media');
const FETCH_TIMEOUT_MS = 15000;

function safeName(repo: TrendingRepo): string {
  return `${repo.owner}-${repo.name}`.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

export async function fetchRepoOgImage(repo: TrendingRepo): Promise<string | null> {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });

  const cacheBuster = crypto.randomBytes(16).toString('hex');
  const url = `https://opengraph.githubassets.com/${cacheBuster}/${repo.owner}/${repo.name}`;
  const filepath = path.join(MEDIA_DIR, `${safeName(repo)}-${Date.now()}.png`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'image/png,image/*;q=0.8,*/*;q=0.5',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn(`OG image fetch failed (${res.status}): ${repo.slug}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) {
      log.warn(`OG image suspiciously small (${buf.length}B): ${repo.slug}`);
      return null;
    }
    fs.writeFileSync(filepath, buf);
    log.ok(`OG image: ${repo.slug} → ${path.basename(filepath)} (${buf.length}B)`);
    return filepath;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`OG image error for ${repo.slug}: ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function cleanupMediaFile(filepath: string | undefined | null): void {
  if (!filepath) return;
  try {
    fs.rmSync(filepath, { force: true });
  } catch {}
}
