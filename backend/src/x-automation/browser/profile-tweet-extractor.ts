import type { Page } from 'patchright';
import type { SelectorRegistry } from './selector-registry';

export interface BrowserTweetResult {
  url: string;
  text: string;
  handle: string;
  displayName: string;
  likeCount: string;
  retweetCount: string;
  replyCount: string;
  postedAt: string;
}

/**
 * In-page DOM extraction for tweet cards on a profile timeline. Pulled out
 * of XBrowserService so the tweet-card shape and selector mapping live
 * next to each other; the service stays focused on browser-pool lifecycle.
 *
 * Runs entirely inside `page.evaluate` — the only outer dependency is the
 * SelectorRegistry, which is serialised across the boundary as plain
 * strings.
 */
export async function extractTweetCards(
  page: Page,
  limit: number,
  sel: SelectorRegistry,
): Promise<BrowserTweetResult[]> {
  return page.evaluate((params) => {
    const articles = Array.from(document.querySelectorAll(params.tweetArticle)).slice(0, params.limit);
    return articles.map((article) => {
      const tweetLink = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
      const likeEl = article.querySelector(params.likeCount);
      const rtEl = article.querySelector(params.retweetCount);
      const replyEl = article.querySelector(params.replyCount);
      return {
        url: tweetLink?.href ?? '',
        text: article.querySelector(params.tweetText)?.textContent ?? '',
        handle: tweetLink?.pathname?.split('/').filter(Boolean)[0] ?? '',
        displayName: article.querySelector(params.userNames)?.textContent ?? '',
        likeCount: likeEl?.textContent ?? '0',
        retweetCount: rtEl?.textContent ?? '0',
        replyCount: replyEl?.textContent ?? '0',
        postedAt: article.querySelector('time')?.getAttribute('datetime') ?? '',
      };
    });
  }, {
    limit,
    tweetArticle: sel.tweetArticle,
    tweetText: sel.tweetText,
    userNames: sel.userNames,
    likeCount: sel.tweetLikeCount,
    retweetCount: sel.tweetRetweetCount,
    replyCount: sel.tweetReplyCount,
  });
}
