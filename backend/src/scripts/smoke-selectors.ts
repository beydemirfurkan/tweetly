/**
 * Selector regression canary.
 *
 * Hits a small set of authenticated X.com pages and verifies that each
 * critical selector listed in SelectorRegistry still resolves at least
 * one element. Designed to run as a daily cron — when X reshuffles the
 * DOM, this fails before real user actions start failing.
 *
 * Required env:
 *   X_EXECUTOR_MODE=patchright       (so XBrowserService.launch() runs)
 *   TWEETLY_SMOKE_TARGET_TWEET_URL   public tweet URL (for tweetArticle/like/retweet checks)
 *   TWEETLY_SMOKE_TARGET_HANDLE      target handle (for follow/unfollow buttons)
 *   TWEETLY_SMOKE_ACCOUNT_ID         (optional) account id; falls back to first active.
 *
 * Exit code: 0 = all selectors found, 1 = one or more missing.
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import type { Page } from 'patchright';
import { AppModule } from '@/app.module';
import { XBrowserService } from '@/x-automation/browser/x-browser.service';
import { SelectorRegistry } from '@/x-automation/browser/selector-registry';
import { AccountsService } from '@/accounts/accounts.service';

dotenv.config();

interface SelectorCheck {
  name: string;
  url: string;
  selector: string;
}

async function resolveAccountId(accounts: AccountsService): Promise<string> {
  const explicit = process.env.TWEETLY_SMOKE_ACCOUNT_ID;
  if (explicit) return explicit;
  const list = await accounts.listActive();
  if (list.length === 0) throw new Error('No active accounts configured');
  return list[0].id;
}

function selectorsToCheck(sel: SelectorRegistry): SelectorCheck[] {
  const tweetUrl = process.env.TWEETLY_SMOKE_TARGET_TWEET_URL;
  const handle = process.env.TWEETLY_SMOKE_TARGET_HANDLE;
  const checks: SelectorCheck[] = [
    { name: 'home composer', url: 'https://x.com/home', selector: sel.composer },
    { name: 'home post button', url: 'https://x.com/home', selector: sel.postButton },
    { name: 'media file input', url: 'https://x.com/home', selector: sel.mediaInput },
    { name: 'trending', url: 'https://x.com/explore/tabs/trending', selector: '[data-testid="trend"]' },
    { name: 'search user cells', url: 'https://x.com/search?q=news&f=user', selector: '[data-testid="UserCell"]' },
  ];
  if (tweetUrl) {
    checks.push(
      { name: 'tweet article', url: tweetUrl, selector: sel.tweetArticle },
      { name: 'like button', url: tweetUrl, selector: sel.likeButton },
      { name: 'retweet button', url: tweetUrl, selector: sel.retweetButton },
      { name: 'bookmark button', url: tweetUrl, selector: sel.bookmarkButton },
      { name: 'more actions (caret)', url: tweetUrl, selector: sel.moreActionsButton },
    );
  }
  if (handle) {
    checks.push({
      name: 'follow button',
      url: `https://x.com/${handle}`,
      selector: sel.followButton(handle),
    });
  }
  return checks;
}

async function checkSelector(
  page: Page,
  check: SelectorCheck,
): Promise<{ ok: boolean; reason?: string }> {
  await page.goto(check.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  try {
    await page.waitForSelector(check.selector, { timeout: 12_000 });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

async function main(): Promise<void> {
  if ((process.env.X_EXECUTOR_MODE ?? '') !== 'patchright') {
    throw new Error('Selector smoke must run with X_EXECUTOR_MODE=patchright');
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  app.enableShutdownHooks();
  const browser = app.get(XBrowserService);
  const sel = app.get(SelectorRegistry);
  const accounts = app.get(AccountsService);

  const accountId = await resolveAccountId(accounts);
  const checks = selectorsToCheck(sel);

  const { context, page } = await browser.launch(accountId);
  const failures: Array<{ name: string; selector: string; reason: string }> = [];
  try {
    for (const check of checks) {
      const result = await checkSelector(page, check);
      const status = result.ok ? 'OK' : 'FAIL';
      console.log(`[${status}] ${check.name.padEnd(28)} ${check.selector}`);
      if (!result.ok) {
        failures.push({ name: check.name, selector: check.selector, reason: result.reason ?? '' });
      }
    }
  } finally {
    await browser.release(context);
    await app.close();
  }

  if (failures.length > 0) {
    console.error('\nSelector regression detected:');
    for (const f of failures) {
      console.error(`  - ${f.name} :: ${f.selector}\n    ${f.reason}`);
    }
    process.exit(1);
  }
  console.log(`\nAll ${checks.length} selectors verified.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
