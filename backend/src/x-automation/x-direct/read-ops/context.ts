import type { XBrowserService } from '@/x-automation/browser/x-browser.service';
import type { SelectorRegistry } from '@/x-automation/browser/selector-registry';
import type { SessionRunner } from '../x-direct-base.service';
import type { PaginatedResult } from '../pagination.util';
import type { TweetSelectors, UserCellSelectors } from '../read-page.utils';
import type { UserListItem } from '../x-direct.types';

/**
 * Surface that read-ops free functions need from the service. The service
 * constructs this once and passes it in — keeps ops modules independently
 * testable and lets the service stay a thin façade over the verb groups.
 */
export interface XDirectReadCtx {
  browser: XBrowserService;
  sel: SelectorRegistry;
  withSession: <T>(
    op: string,
    accountId: string | undefined,
    fn: SessionRunner<T>,
  ) => Promise<T>;
  sanitizeText: (s: string) => string;
  tweetSel: () => TweetSelectors;
  userSel: () => UserCellSelectors;
  scrapeUserList: (
    url: string,
    limit: number,
    accountId: string | undefined,
    cursor: string | undefined,
    options: { verifiedOnly?: boolean },
  ) => Promise<PaginatedResult<UserListItem>>;
}
