import * as cheerio from 'cheerio';
import type { TrendingRepo } from '../types';
import type { SourcedItem } from './types';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface FetchTrendingOptions {
  since?: 'daily' | 'weekly' | 'monthly';
  language?: string;
}

function parseIntFromText(text: string): number {
  const match = text.match(/[\d,]+/);
  if (!match) return 0;
  const n = parseInt(match[0].replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchTrending(
  options: FetchTrendingOptions = {}
): Promise<TrendingRepo[]> {
  const { since = 'daily', language = '' } = options;
  const url = new URL('https://github.com/trending');
  if (language) url.pathname = `/trending/${language}`;
  url.searchParams.set('since', since);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('GitHub Trending timeout after 20000ms');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`GitHub Trending fetch başarısız: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const rows: TrendingRepo[] = [];

  $('article.Box-row').each((_, el) => {
    const $el = $(el);
    const $titleA = $el.find('h2 a').first();
    const href = ($titleA.attr('href') ?? '').trim();
    if (!href) return;
    const slug = href.replace(/^\//, '');
    const [owner, name] = slug.split('/');
    if (!owner || !name) return;

    const description = $el.find('p').first().text().trim();
    const language = $el.find('span[itemprop="programmingLanguage"]').first().text().trim();
    const starsTodayText = $el.find('span.d-inline-block.float-sm-right').first().text().trim();
    const starsToday = parseIntFromText(starsTodayText);

    const totalStarsText = $el
      .find('a.Link--muted')
      .filter((_, a) => $(a).attr('href') === `${href}/stargazers`)
      .first()
      .text()
      .trim();
    const totalStars = parseIntFromText(totalStarsText);

    rows.push({
      owner,
      name,
      slug,
      url: `https://github.com${href}`,
      description,
      language,
      starsToday,
      totalStars,
    });
  });

  return rows;
}

export function toSourcedItems(repos: TrendingRepo[]): SourcedItem[] {
  return repos.map((r) => ({
    title: `${r.owner}/${r.name}`,
    url: r.url,
    description: r.description,
    source: 'github-trending',
    owner: r.owner,
    name: r.name,
    language: r.language,
    starsToday: r.starsToday,
    totalStars: r.totalStars,
  }));
}
