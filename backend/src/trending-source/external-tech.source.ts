import crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { TrendingRepo } from '../domain/types/content.types';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15_000;

interface HackerNewsItem {
  id?: number;
  type?: string;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  time?: number;
}

interface DevToArticle {
  id?: number;
  title?: string;
  description?: string;
  url?: string;
  published_at?: string;
  readable_publish_date?: string;
  tag_list?: string[];
  public_reactions_count?: number;
  comments_count?: number;
  user?: { username?: string; name?: string };
}

export interface FetchExternalSourceOptions {
  hackerNewsLimit?: number;
  devToLimit?: number;
  includeHackerNews?: boolean;
  includeDevTo?: boolean;
}

@Injectable()
export class ExternalTechSource {
  private readonly log = new Logger(ExternalTechSource.name);

  async fetchCandidates(options: FetchExternalSourceOptions = {}): Promise<TrendingRepo[]> {
    const includeHackerNews = options.includeHackerNews ?? true;
    const includeDevTo = options.includeDevTo ?? true;
    const results = await Promise.allSettled([
      includeHackerNews ? this.fetchHackerNews(options.hackerNewsLimit ?? 25) : Promise.resolve([]),
      includeDevTo ? this.fetchDevTo(options.devToLimit ?? 25) : Promise.resolve([]),
    ]);

    const candidates: TrendingRepo[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') candidates.push(...result.value);
      else this.log.warn(`External source fetch failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    }

    this.log.log(`External tech sources: ${candidates.length} aday`);
    return candidates;
  }

  private async fetchHackerNews(limit: number): Promise<TrendingRepo[]> {
    const ids = await fetchJson<number[]>('https://hacker-news.firebaseio.com/v0/topstories.json');
    const selectedIds = ids.slice(0, Math.max(1, limit));
    const items = await Promise.allSettled(
      selectedIds.map((id) => fetchJson<HackerNewsItem>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)),
    );

    const rows = items
      .filter((result): result is PromiseFulfilledResult<HackerNewsItem> => result.status === 'fulfilled')
      .map((result) => result.value)
      .filter((item) => item.type === 'story' && item.title && item.url)
      .map((item) => hnToCandidate(item));

    this.log.log(`Hacker News: ${rows.length} aday`);
    return rows;
  }

  private async fetchDevTo(limit: number): Promise<TrendingRepo[]> {
    const url = new URL('https://dev.to/api/articles');
    url.searchParams.set('top', '1');
    url.searchParams.set('per_page', String(Math.min(Math.max(1, limit), 100)));

    const articles = await fetchJson<DevToArticle[]>(url.toString());
    const rows = articles.filter((article) => article.title && article.url).map((article) => devToCandidate(article));
    this.log.log(`dev.to: ${rows.length} aday`);
    return rows;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json,text/plain;q=0.9,*/*;q=0.5',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${url} failed: ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`${url} timeout after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function hnToCandidate(item: HackerNewsItem): TrendingRepo {
  const title = normalizeTitle(item.title ?? 'hacker news story');
  const url = item.url ?? `https://news.ycombinator.com/item?id=${item.id ?? ''}`;
  const domain = hostname(url) || 'external';
  const slug = `hacker-news/${stableSlug(`${item.id ?? ''}-${title}`)}`;
  return {
    owner: 'hacker-news',
    name: title,
    slug,
    url,
    description: `${title} (${domain})`,
    language: domain,
    starsToday: item.score ?? 0,
    totalStars: item.score ?? 0,
    sourceType: 'discussion',
    sourceId: 'hacker_news',
    sourceName: 'Hacker News',
    publishedAt: item.time ? new Date(item.time * 1000).toISOString() : undefined,
    discussionCount: item.descendants ?? 0,
  };
}

function devToCandidate(article: DevToArticle): TrendingRepo {
  const title = normalizeTitle(article.title ?? 'dev.to article');
  const username = article.user?.username ?? 'dev-to';
  const tags = Array.isArray(article.tag_list) ? article.tag_list.join(', ') : '';
  const slug = `dev-to/${stableSlug(`${article.id ?? ''}-${title}`)}`;
  const reactions = article.public_reactions_count ?? 0;
  return {
    owner: username,
    name: title,
    slug,
    url: article.url ?? `https://dev.to/${username}`,
    description: [article.description, tags ? `tags: ${tags}` : ''].filter(Boolean).join(' '),
    language: tags,
    starsToday: reactions,
    totalStars: reactions,
    sourceType: 'article',
    sourceId: 'dev_to',
    sourceName: 'dev.to',
    publishedAt: article.published_at ?? article.readable_publish_date,
    discussionCount: article.comments_count ?? 0,
  };
}

function stableSlug(value: string): string {
  const readable = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const hash = crypto.createHash('sha1').update(value).digest('hex').slice(0, 8);
  return `${readable || 'item'}-${hash}`;
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
