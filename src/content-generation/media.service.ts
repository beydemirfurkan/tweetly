import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { TrendingRepo } from '../domain/types/content.types';

const FETCH_TIMEOUT_MS = 15_000;

@Injectable()
export class MediaService {
  private readonly log = new Logger(MediaService.name);
  private readonly mediaDir: string;

  constructor() {
    this.mediaDir = path.join(process.env.DATA_DIR ?? './data', 'media');
  }

  async fetchRepoOgImage(repo: TrendingRepo): Promise<string | null> {
    fs.mkdirSync(this.mediaDir, { recursive: true });

    const cacheBuster = crypto.randomBytes(16).toString('hex');
    const url = `https://opengraph.githubassets.com/${cacheBuster}/${repo.owner}/${repo.name}`;
    const safeName = `${repo.owner}-${repo.name}`.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    const filepath = path.join(this.mediaDir, `${safeName}-${Date.now()}.png`);

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
        this.log.warn(`OG image fetch failed (${res.status}): ${repo.slug}`);
        return null;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) {
        this.log.warn(`OG image suspiciously small (${buf.length}B): ${repo.slug}`);
        return null;
      }
      fs.writeFileSync(filepath, buf);
      this.log.log(`OG image: ${repo.slug} → ${path.basename(filepath)} (${buf.length}B)`);
      return filepath;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`OG image error for ${repo.slug}: ${msg}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
