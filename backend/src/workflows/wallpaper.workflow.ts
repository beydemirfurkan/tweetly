import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { ContentMemoryService } from '../content-memory/content-memory.service';
import { ActionEnqueueService } from '../action-engine/action-enqueue.service';
import type { IContentWorkflow } from './content-workflow.interface';

const FETCH_TIMEOUT_MS = 20_000;
const REDDIT_API = 'https://www.reddit.com/r/{sub}/top.json?limit=25&t=day';

interface RedditPost {
  post_hint?: string;
  url: string;
  permalink: string;
  title: string;
  id: string;
}

@Injectable()
export class WallpaperWorkflow implements IContentWorkflow {
  readonly scenarioType = 'wallpaper';
  private readonly log = new Logger(WallpaperWorkflow.name);
  private readonly mediaDir: string;

  constructor(
    private readonly settings: SettingsService,
    private readonly contentMemory: ContentMemoryService,
    private readonly enqueue: ActionEnqueueService,
  ) {
    this.mediaDir = path.join(process.env.DATA_DIR ?? './data', 'media');
  }

  async run(accountId?: string): Promise<void> {
    const subreddit = await this.settings.get<string>('scenario.wallpaper.subreddit', 'wallpaper', accountId);
    const perDay = await this.settings.get<number>('scenario.wallpaper.per_day', 3, accountId);
    const caption = await this.settings.get<string>('scenario.wallpaper.caption_template', '', accountId);

    this.log.log(`WallpaperWorkflow: account=${accountId ?? 'default'} subreddit=r/${subreddit} perDay=${perDay}`);

    const posts = await this.fetchRedditPosts(subreddit);
    if (!posts.length) {
      this.log.warn(`No image posts found in r/${subreddit}`);
      return;
    }

    let enqueued = 0;
    const now = Date.now();

    for (const post of posts) {
      if (enqueued >= perDay) break;

      const urlHash = crypto.createHash('sha256').update(post.url).digest('hex').slice(0, 16);
      const isDupe = await this.contentMemory.similarityReason(post.url, accountId);
      if (isDupe) {
        this.log.debug(`Skipping duplicate: ${post.id}`);
        continue;
      }

      const mediaPath = await this.downloadImage(post.url, post.id);
      if (!mediaPath) continue;

      const intervalMs = (24 * 60 * 60 * 1000) / perDay;
      const scheduledAt = new Date(now + enqueued * intervalMs);
      const text = caption.trim();

      await this.enqueue.enqueuePost({
        accountId: accountId ?? '',
        text,
        mediaPath,
        scheduledAt,
        metadata: {
          source: 'wallpaper',
          subreddit,
          redditUrl: `https://reddit.com${post.permalink}`,
          redditPostId: post.id,
          urlHash,
        },
      });

      await this.contentMemory.add(post.url, text || post.url, accountId);
      enqueued++;
      this.log.log(`Enqueued wallpaper ${enqueued}/${perDay}: ${post.id}`);
    }

    this.log.log(`WallpaperWorkflow done: ${enqueued} posts enqueued`);
  }

  private async fetchRedditPosts(subreddit: string): Promise<RedditPost[]> {
    const url = REDDIT_API.replace('{sub}', subreddit);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'tweetly-bot/1.0' },
        signal: controller.signal,
      });
      if (!res.ok) {
        this.log.warn(`Reddit API error: ${res.status} for r/${subreddit}`);
        return [];
      }
      const json = (await res.json()) as { data?: { children?: Array<{ data: RedditPost }> } };
      const children = json?.data?.children ?? [];
      return children
        .map((c) => c.data)
        .filter((p) => p.post_hint === 'image' && p.url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`Reddit fetch error: ${msg}`);
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  private async downloadImage(imageUrl: string, postId: string): Promise<string | null> {
    fs.mkdirSync(this.mediaDir, { recursive: true });

    const ext = imageUrl.split('.').pop()?.split('?')[0] ?? 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
    const filepath = path.join(this.mediaDir, `wallpaper-${postId}-${Date.now()}.${safeExt}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(imageUrl, {
        headers: { 'User-Agent': 'tweetly-bot/1.0' },
        signal: controller.signal,
      });
      if (!res.ok) {
        this.log.warn(`Image download failed (${res.status}): ${imageUrl}`);
        return null;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 10_000) {
        this.log.warn(`Image too small (${buf.length}B): ${postId}`);
        return null;
      }
      fs.writeFileSync(filepath, buf);
      this.log.log(`Downloaded: ${postId} → ${path.basename(filepath)} (${buf.length}B)`);
      return filepath;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`Image download error for ${postId}: ${msg}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
