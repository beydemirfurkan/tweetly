import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { TrendingRepo } from '../domain/types/content.types';

const FETCH_TIMEOUT_MS = 15_000;
const README_MAX_BYTES = 256 * 1024;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MIN_BYTES = 1024;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const VALID_IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const BADGE_HOST_FRAGMENTS = [
  'shields.io',
  'badge.fury.io',
  'badgen.net',
  'travis-ci.org',
  'travis-ci.com',
  'circleci.com',
  'codecov.io',
  'coveralls.io',
  'codeclimate.com',
  'snyk.io',
  'depfu.com',
  'gitter.im',
  'discord.com/api/guilds',
  'opencollective.com',
  'paypal.com',
  'patreon.com',
  'ko-fi.com',
];
const BADGE_KEYWORDS_RE =
  /\b(badge|logo|status|build|coverage|license|version|downloads|sponsor|stars|forks|issues|contributors|chat|discord|slack|twitter|nuget|npm)\b/i;

interface ImageCandidate {
  url: string;
  alt: string;
  /** Raw <img> tag if HTML; null for markdown */
  rawTag: string | null;
}

@Injectable()
export class MediaService {
  private readonly log = new Logger(MediaService.name);
  private readonly mediaDir: string;

  constructor() {
    this.mediaDir = path.join(process.env.DATA_DIR ?? './data', 'media');
  }

  async fetchHeroOrOg(repo: TrendingRepo): Promise<string | null> {
    const hero = await this.fetchReadmeHeroImage(repo);
    if (hero) return hero;
    return this.fetchRepoOgImage(repo);
  }

  async fetchReadmeHeroImage(repo: TrendingRepo): Promise<string | null> {
    if (repo.sourceType && repo.sourceType !== 'github') return null;
    if (!repo.owner || !repo.name) return null;

    const readme = await this.fetchReadmeText(repo.owner, repo.name);
    if (!readme) return null;

    const candidates = extractImageCandidates(readme);
    const filtered = candidates
      .map((c) => ({ ...c, url: resolveImageUrl(c.url, repo.owner, repo.name) }))
      .filter((c) => c.url && isLikelyHeroImage(c));

    if (filtered.length === 0) {
      this.log.log(`README hero: ${repo.slug} aday görsel yok`);
      return null;
    }

    for (const candidate of filtered) {
      const saved = await this.downloadImage(candidate.url, repo, 'hero');
      if (saved) return saved;
    }

    return null;
  }

  async fetchRepoOgImage(repo: TrendingRepo): Promise<string | null> {
    if (repo.sourceType && repo.sourceType !== 'github') return null;
    if (!repo.owner || !repo.name) return null;

    const cacheBuster = crypto.randomBytes(16).toString('hex');
    const url = `https://opengraph.githubassets.com/${cacheBuster}/${repo.owner}/${repo.name}`;
    return this.downloadImage(url, repo, 'og', { fallbackExt: 'png' });
  }

  private async fetchReadmeText(owner: string, name: string): Promise<string | null> {
    const url = `https://api.github.com/repos/${owner}/${name}/readme`;
    const headers: Record<string, string> = {
      'User-Agent': UA,
      Accept: 'application/vnd.github.raw',
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok) {
        if (res.status !== 404) {
          this.log.warn(`README fetch failed (${res.status}): ${owner}/${name}`);
        }
        return null;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) return null;
      return buf.slice(0, README_MAX_BYTES).toString('utf8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`README error for ${owner}/${name}: ${msg}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async downloadImage(
    url: string,
    repo: TrendingRepo,
    label: string,
    opts: { fallbackExt?: string } = {},
  ): Promise<string | null> {
    fs.mkdirSync(this.mediaDir, { recursive: true });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'image/png,image/*;q=0.8,*/*;q=0.5',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!res.ok) {
        this.log.warn(`${label} fetch failed (${res.status}): ${repo.slug} ${url}`);
        return null;
      }

      const contentType = res.headers.get('content-type') ?? '';
      const ext = pickExtension(url, contentType, opts.fallbackExt);
      if (!ext) {
        this.log.warn(`${label} unsupported content-type (${contentType}): ${url}`);
        return null;
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < IMAGE_MIN_BYTES) {
        this.log.warn(`${label} suspiciously small (${buf.length}B): ${repo.slug}`);
        return null;
      }
      if (buf.length > IMAGE_MAX_BYTES) {
        this.log.warn(`${label} too large (${buf.length}B): ${repo.slug}`);
        return null;
      }

      const safeName = `${repo.owner}-${repo.name}`.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
      const filepath = path.join(this.mediaDir, `${safeName}-${label}-${Date.now()}.${ext}`);
      fs.writeFileSync(filepath, buf);
      this.log.log(`${label} image: ${repo.slug} → ${path.basename(filepath)} (${buf.length}B)`);
      return filepath;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`${label} error for ${repo.slug}: ${msg}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

function extractImageCandidates(readme: string): ImageCandidate[] {
  const out: ImageCandidate[] = [];

  // Markdown: ![alt](url "title")
  const mdRe = /!\[([^\]]*)\]\(\s*<?([^)\s>"]+)>?(?:\s+"[^"]*")?\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = mdRe.exec(readme)) !== null) {
    out.push({ alt: match[1] ?? '', url: match[2] ?? '', rawTag: null });
  }

  // HTML: <img ... src="..." ...>
  const htmlRe = /<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi;
  while ((match = htmlRe.exec(readme)) !== null) {
    const tag = match[0];
    const altMatch = /\balt=["']([^"']*)["']/i.exec(tag);
    out.push({ alt: altMatch?.[1] ?? '', url: match[1] ?? '', rawTag: tag });
  }

  return out;
}

function isLikelyHeroImage(c: ImageCandidate): boolean {
  if (!c.url) return false;

  const lowerUrl = c.url.toLowerCase();
  for (const frag of BADGE_HOST_FRAGMENTS) {
    if (lowerUrl.includes(frag)) return false;
  }

  // GitHub Actions / workflow badges
  if (/github\.com\/[^/]+\/[^/]+\/(?:actions|workflows)\/.*badge\.svg/.test(lowerUrl)) return false;
  if (lowerUrl.endsWith('.svg') && BADGE_KEYWORDS_RE.test(lowerUrl)) return false;

  // SVG genelde logo/badge — ekran görüntüsü değil. Reddet.
  if (lowerUrl.endsWith('.svg') || lowerUrl.includes('.svg?')) return false;

  // Dosya uzantısı yoksa (camo proxied vb.) yine de aday — content-type'tan anlarız.
  const altLower = c.alt.toLowerCase();
  if (BADGE_KEYWORDS_RE.test(altLower)) return false;

  if (c.rawTag) {
    const widthMatch = /\bwidth=["']?(\d+)/i.exec(c.rawTag);
    if (widthMatch) {
      const width = Number(widthMatch[1]);
      if (Number.isFinite(width) && width > 0 && width < 200) return false;
    }
    const heightMatch = /\bheight=["']?(\d+)/i.exec(c.rawTag);
    if (heightMatch) {
      const height = Number(heightMatch[1]);
      if (Number.isFinite(height) && height > 0 && height < 100) return false;
    }
  }

  return true;
}

function resolveImageUrl(rawUrl: string, owner: string, name: string): string {
  const url = rawUrl.trim();
  if (!url) return '';

  if (/^https?:\/\//i.test(url)) {
    // GitHub blob URL'lerini raw'a çevir.
    const blobRe = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)$/i;
    const m = blobRe.exec(url);
    if (m) {
      return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
    }
    return url;
  }

  if (url.startsWith('//')) return `https:${url}`;

  // Relative ya da repo-root path
  const cleaned = url.replace(/^\.\//, '').replace(/^\//, '');
  return `https://raw.githubusercontent.com/${owner}/${name}/HEAD/${cleaned}`;
}

function pickExtension(url: string, contentType: string, fallback?: string): string | null {
  const ct = contentType.toLowerCase().split(';')[0]?.trim() ?? '';
  const ctMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  if (ctMap[ct]) return ctMap[ct];

  const urlExt = url.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase() ?? '';
  if (VALID_IMAGE_EXT.has(urlExt)) return urlExt === 'jpeg' ? 'jpg' : urlExt;

  if (fallback && VALID_IMAGE_EXT.has(fallback)) return fallback;
  return null;
}

// Test için export — production kodu sadece sınıfı kullanır.
export const __testing = {
  extractImageCandidates,
  isLikelyHeroImage,
  resolveImageUrl,
  pickExtension,
};
