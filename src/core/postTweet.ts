import path from 'path';
import fs from 'fs';
import type { Locator, Page } from 'patchright';
import { launch } from './browser';
import { config } from '../config';
import * as accounts from '../storage/accounts';
import { make } from '../utils/logger';

const log = make('postTweet');
const AUTH_REQUIRED_PREFIX = 'AUTH_REQUIRED:';
const MAX_TWEET_LEN = 280;

export interface PostResult {
  tweetId: string;
  tweetUrl: string;
}

export function isAuthRequiredError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.startsWith(AUTH_REQUIRED_PREFIX);
}

function authRequired(message: string): Error {
  return new Error(`${AUTH_REQUIRED_PREFIX} ${message}`);
}

function resolveUsername(accountId?: string): string {
  if (accountId) return accountId;
  const account = accounts.list()[0];
  return account?.id ?? config.x.username;
}

function validateText(text: string): void {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('postTweet: boş metin');
  }
  if (text.length > MAX_TWEET_LEN) {
    throw new Error(`postTweet: metin ${MAX_TWEET_LEN} karakteri aşıyor (${text.length})`);
  }
}

async function typeHuman(locator: Locator, text: string): Promise<void> {
  for (const ch of text) {
    await locator.type(ch, { delay: 30 + Math.floor(Math.random() * 60) });
  }
}

async function attachMedia(page: Page, mediaPath: string): Promise<void> {
  if (!fs.existsSync(mediaPath)) {
    log.warn(`Media bulunamadi, atlaniyor: ${mediaPath}`);
    return;
  }
  const fileInput = page.locator('input[data-testid="fileInput"]').first();
  try {
    await fileInput.waitFor({ state: 'attached', timeout: 5000 });
    await fileInput.setInputFiles(mediaPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Media file input bulunamadi (${msg}), tweet text-only gonderilecek.`);
    return;
  }

  try {
    await page.waitForSelector(
      '[data-testid="attachments"], div[aria-label="Image"], div[data-testid="tweetPhoto"]',
      { timeout: 20000 }
    );
    log.ok(`Media yuklendi: ${path.basename(mediaPath)}`);
  } catch {
    log.warn('Media upload preview gorunmedi (timeout). Yine de devam ediliyor.');
  }
  await page.waitForTimeout(800 + Math.random() * 600);
}

async function saveErrorScreenshot(page: Page, prefix: string): Promise<string | null> {
  try {
    fs.mkdirSync(config.paths.errors, { recursive: true });
    const screenshotPath = path.join(config.paths.errors, `${prefix}-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  } catch {
    return null;
  }
}

async function ensureLoggedIn(page: Page): Promise<void> {
  if (page.url().includes('/login') || page.url().includes('/i/flow')) {
    throw authRequired('Session geçersiz — X_AUTH_TOKEN ile session import edilmeli.');
  }
}

async function waitForComposer(page: Page, label: string): Promise<Locator> {
  const composer = page.locator('[data-testid="tweetTextarea_0"]').first();
  try {
    await composer.waitFor({ state: 'visible', timeout: 20000 });
    return composer;
  } catch (firstErr) {
    try {
      await composer.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      await composer.waitFor({ state: 'visible', timeout: 10000 });
      return composer;
    } catch (err) {
      const title = await page.title().catch(() => 'unknown');
      const detail = err instanceof Error ? err.message : String(err);
      if (page.url() === 'https://x.com/' || title.includes('Olan biten burada')) {
        throw authRequired(`X logged-out görünüyor. URL=${page.url()} title=${title}. ${detail}`);
      }
      void firstErr;
      throw new Error(`${label} bulunamadı. URL=${page.url()} title=${title}. ${detail}`);
    }
  }
}

async function pressPostButton(page: Page): Promise<void> {
  const postBtn = page
    .locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]')
    .first();
  await postBtn.waitFor({ state: 'visible', timeout: 10000 });
  const disabled = await postBtn.getAttribute('aria-disabled');
  if (disabled === 'true') {
    throw new Error('Post butonu disabled — metinde sorun olabilir.');
  }
  try {
    await postBtn.click({ timeout: 5000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Post butonu normal click başarısız, DOM click deneniyor: ${msg}`);
    await page.keyboard.press('Escape').catch(() => undefined);
    await postBtn.evaluate((button) => (button as HTMLElement).click());
  }
}

async function waitForPostConfirmation(page: Page): Promise<void> {
  try {
    await Promise.race([
      page.waitForSelector('[data-testid="toast"]', { timeout: 15000 }),
      page.waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="tweetTextarea_0"]');
          return el && (el.textContent ?? '').trim().length === 0;
        },
        { timeout: 15000 }
      ),
    ]);
  } catch {
    throw new Error('Post sonrası onay alınamadı (toast/textarea boşalmadı).');
  }
}

async function extractTweetId(page: Page): Promise<string | null> {
  try {
    await page.waitForTimeout(2000);

    const urlMatch = page.url().match(/\/status\/(\d+)/);
    if (urlMatch) return urlMatch[1];

    const toast = page.locator('[data-testid="toast"]').first();
    if (await toast.isVisible().catch(() => false)) {
      const href = await toast.locator('a[href*="/status/"]').first().getAttribute('href').catch(() => null);
      const m = href?.match(/\/status\/(\d+)/);
      if (m) return m[1];
    }

    const linkHref = await page.locator('a[href*="/status/"]').first().getAttribute('href').catch(() => null);
    return linkHref?.match(/\/status\/(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

interface PostFlowOpts {
  text: string;
  accountId?: string;
  mediaPath?: string;
  navigate: (page: Page) => Promise<void>;
  errorPrefix: 'post' | 'reply';
  composerLabel: string;
  onSuccess: (username: string, tweetId: string | null) => void;
}

async function executePostFlow(opts: PostFlowOpts): Promise<PostResult> {
  validateText(opts.text);
  const username = resolveUsername(opts.accountId);
  const { context, page } = await launch(opts.accountId);

  try {
    await opts.navigate(page);
    await page.waitForTimeout(3000);
    await ensureLoggedIn(page);

    const composer = await waitForComposer(page, opts.composerLabel);
    await composer.click();
    await page.waitForTimeout(400 + Math.random() * 600);
    await typeHuman(composer, opts.text);
    await page.waitForTimeout(700 + Math.random() * 800);

    if (opts.mediaPath) {
      await attachMedia(page, opts.mediaPath);
    }

    await pressPostButton(page);
    await waitForPostConfirmation(page);

    const tweetId = await extractTweetId(page);
    const tweetUrl = tweetId ? `https://x.com/${username}/status/${tweetId}` : '';

    opts.onSuccess(username, tweetId);
    await page.waitForTimeout(3000);

    return { tweetId: tweetId ?? '', tweetUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const tag = opts.errorPrefix === 'reply' ? 'REPLY HATA' : 'HATA';
    log.error(`${tag} (@${username}): ${msg}`);
    const screenshotPath = await saveErrorScreenshot(page, opts.errorPrefix);
    if (screenshotPath) log.error(`Screenshot: ${screenshotPath}`);
    throw err;
  } finally {
    await context.close();
  }
}

function previewText(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function postTweet(
  text: string,
  accountId?: string,
  mediaPath?: string
): Promise<PostResult> {
  return executePostFlow({
    text,
    accountId,
    mediaPath,
    navigate: async (page) => {
      await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    },
    errorPrefix: 'post',
    composerLabel: 'Tweet composer',
    onSuccess: (username, tweetId) => {
      log.ok(
        `Atıldı (@${username}): "${previewText(text)}"${tweetId ? ` (id=${tweetId})` : ' (id yakalanamadı)'}`
      );
    },
  });
}

export async function postReply(
  parentTweetUrl: string,
  text: string,
  accountId?: string
): Promise<PostResult> {
  if (!parentTweetUrl || !parentTweetUrl.includes('/status/')) {
    throw new Error(`postReply: gecersiz parent URL: ${parentTweetUrl}`);
  }
  return executePostFlow({
    text,
    accountId,
    navigate: async (page) => {
      await page.goto(parentTweetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });
    },
    errorPrefix: 'reply',
    composerLabel: 'Reply composer',
    onSuccess: (username, tweetId) => {
      log.ok(
        `Reply atildi (@${username}): "${previewText(text)}" → ${parentTweetUrl}${tweetId ? ` (id=${tweetId})` : ''}`
      );
    },
  });
}

export async function postThread(
  parentTweetUrl: string,
  text: string,
  accountId?: string
): Promise<PostResult> {
  return postReply(parentTweetUrl, text, accountId);
}

export default postTweet;

if (require.main === module) {
  const text = process.argv.slice(2).join(' ');
  if (!text) {
    log.error('Kullanım: node dist/core/postTweet.js "tweet metni"');
    process.exit(1);
  }
  postTweet(text).catch(() => process.exit(1));
}
