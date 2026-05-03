import { Logger } from '@nestjs/common';
import type { Page } from 'patchright';
import { XBrowserService } from '@/x-automation/browser/x-browser.service';
import { SelectorRegistry } from '@/x-automation/browser/selector-registry';
import { AccountsService } from '@/accounts/accounts.service';
import { isAuthRequiredError } from '@/x-automation/browser/x-post-flow.service';

export type SessionRunner<T> = (page: Page, accountId: string) => Promise<T>;

/**
 * Shared scaffolding for the three x-direct flavors (read/write/profile).
 *
 * The 785-LOC XDirectService duplicated the same try { launch → assertHealthy
 * → run → } finally { release } shape across ~20 methods. `withSession()`
 * collapses that into one helper; `withDryRun()` short-circuits in noop
 * mode without touching the browser.
 */
export abstract class XDirectBaseService {
  protected readonly log = new Logger(this.constructor.name);

  constructor(
    protected readonly browser: XBrowserService,
    protected readonly sel: SelectorRegistry,
    protected readonly accounts: AccountsService,
  ) {}

  protected isNoopMode(): boolean {
    return (process.env.X_EXECUTOR_MODE ?? 'noop') !== 'patchright';
  }

  protected async resolveAccountId(accountId?: string): Promise<string> {
    if (accountId) return accountId;
    const all = await this.accounts.listActive();
    if (all.length === 0) throw new Error('No active accounts configured');
    return all[0].id;
  }

  /**
   * Acquire a Patchright session for `accountId` (resolving the active one if
   * unspecified), run `fn(page, accountId)` and always release. Errors are
   * logged with the operation name and rethrown via `wrapError`.
   */
  protected async withSession<T>(
    op: string,
    accountId: string | undefined,
    fn: SessionRunner<T>,
  ): Promise<T> {
    const acctId = await this.resolveAccountId(accountId);
    const { context, page } = await this.browser.launch(acctId);
    try {
      return await fn(page, acctId);
    } catch (err) {
      this.log.error(`${op} error: ${err instanceof Error ? err.message : err}`);
      throw this.wrapError(err);
    } finally {
      await this.browser.release(context);
    }
  }

  protected wrapError(err: unknown): Error {
    if (isAuthRequiredError(err)) {
      return new Error('Auth required — session may have expired');
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  /**
   * Strip control characters that DOM textContent can carry (NUL, BS, FF, etc.)
   * and normalize line endings. Keeps \n and \t. Prevents downstream JSON.parse
   * failures and odd display artefacts.
   */
  protected sanitizeText(s: string): string {
    return s
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }
}
