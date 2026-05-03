import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import type { Locator, Page } from 'patchright';
import { XBrowserService } from './x-browser.service';
import { SelectorRegistry } from './selector-registry';
export { AuthRequiredError, isAuthRequiredError } from './auth-required-error';

const MAX_PRACTICAL_TWEET_LEN = 800;

export interface PostResult {
  tweetId: string;
  tweetUrl: string;
}

export interface PostFlowOptions {
  text: string;
  username: string;
  accountId?: string;
  /** Single-file convenience. Prefer mediaPaths for multi-media. */
  mediaPath?: string | null;
  /** Up to 4 images / 1 video / 1 GIF; X enforces this. */
  mediaPaths?: string[] | null;
  /** Per-media accessibility text. Index-aligned with mediaPaths. */
  altTexts?: string[] | null;
  navigate: (page: Page) => Promise<void>;
  composerLabel: string;
}

@Injectable()
export class XPostFlowService {
  private readonly log = new Logger(XPostFlowService.name);

  constructor(
    private readonly browser: XBrowserService,
    private readonly selectors: SelectorRegistry,
  ) {}

  private validateText(text: string): void {
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new Error('postTweet: empty text');
    }
    if (text.length > MAX_PRACTICAL_TWEET_LEN) {
      throw new Error(`postTweet: text exceeds practical length limit (${text.length}/${MAX_PRACTICAL_TWEET_LEN})`);
    }
  }

  private async typeHuman(locator: Locator, text: string): Promise<void> {
    for (const ch of text) {
      await locator.type(ch, { delay: 30 + Math.floor(Math.random() * 60) });
    }
  }

  private async ensureLoggedIn(page: Page, accountId?: string): Promise<void> {
    await this.browser.assertSessionHealthy(page, accountId);
  }

  private async waitForComposer(page: Page, label: string, accountId?: string): Promise<Locator> {
    const composer = page.locator(this.selectors.composer).first();
    try {
      await composer.waitFor({ state: 'visible', timeout: 20000 });
      return composer;
    } catch {
      try {
        await composer.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        await composer.waitFor({ state: 'visible', timeout: 10000 });
        return composer;
      } catch (err) {
        const title = await page.title().catch(() => 'unknown');
        const detail = err instanceof Error ? err.message : String(err);
        await this.browser.assertSessionHealthy(page, accountId);
        throw new Error(`${label} not found. url=${page.url()} title=${title}. ${detail}`);
      }
    }
  }

  private async attachMedia(page: Page, paths: string[], altTexts?: string[] | null): Promise<void> {
    const existing = paths.filter((p) => {
      if (fs.existsSync(p)) return true;
      this.log.warn(`media not found, skipping: ${p}`);
      return false;
    });
    if (existing.length === 0) return;

    const fileInput = page.locator(this.selectors.mediaInput).first();
    try {
      await fileInput.waitFor({ state: 'attached', timeout: 5000 });
      // Patchright's setInputFiles accepts string or string[] — uploading all
      // at once is faster and matches X's "select multiple" UX.
      await fileInput.setInputFiles(existing);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`media file input not found (${msg}), falling back to text-only.`);
      return;
    }
    try {
      await page.waitForSelector(this.selectors.mediaAttached, { timeout: 20000 });
      this.log.log(`Media yüklendi (${existing.length} dosya): ${existing.map((p) => path.basename(p)).join(', ')}`);
    } catch {
      this.log.warn('Media upload preview görünmedi (timeout). Yine de devam ediliyor.');
    }
    await page.waitForTimeout(800 + Math.random() * 600);

    if (altTexts && altTexts.some((t) => t && t.trim().length > 0)) {
      await this.applyAltTexts(page, existing.length, altTexts);
    }
  }

  private async applyAltTexts(page: Page, mediaCount: number, altTexts: string[]): Promise<void> {
    const altButtons = page.locator(this.selectors.mediaAltButton);
    let count = 0;
    try {
      count = await altButtons.count();
    } catch {
      this.log.warn('alt-text buttons not found; skipping alt text.');
      return;
    }
    const toApply = Math.min(count, mediaCount, altTexts.length);
    for (let i = 0; i < toApply; i++) {
      const text = (altTexts[i] ?? '').trim();
      if (!text) continue;
      try {
        await altButtons.nth(i).click({ timeout: 5000 });
        const textarea = page.locator(this.selectors.mediaAltTextarea).first();
        await textarea.waitFor({ state: 'visible', timeout: 5000 });
        await textarea.fill(text);
        const save = page.locator(this.selectors.mediaAltSave).first();
        await save.click({ timeout: 5000 });
        await page.waitForTimeout(400 + Math.random() * 300);
      } catch (err) {
        this.log.warn(`Alt text uygulanamadı (index=${i}): ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  private async pressPostButton(page: Page): Promise<void> {
    const postBtn = page.locator(this.selectors.postButton).first();
    await postBtn.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(
      (button: Element | null) => button?.getAttribute('aria-disabled') !== 'true',
      await postBtn.elementHandle(),
      { timeout: 10000 },
    );
    const disabled = await postBtn.getAttribute('aria-disabled');
    if (disabled === 'true') {
      throw new Error('post button is disabled — text may be invalid.');
    }
    try {
      await postBtn.click({ timeout: 5000 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`post button click failed, falling back to DOM click: ${msg}`);
      await page.keyboard.press('Escape').catch(() => undefined);
      await postBtn.evaluate((button) => (button as HTMLElement).click());
    }
  }

  private async waitForPostConfirmation(page: Page): Promise<void> {
    try {
      await Promise.race([
        page.waitForSelector(this.selectors.toast, { timeout: 15000 }),
        page.waitForFunction(
          (sel: string) => {
            const el = document.querySelector(sel);
            return el && (el.textContent ?? '').trim().length === 0;
          },
          this.selectors.composer,
          { timeout: 15000 },
        ),
      ]);
    } catch {
      throw new Error('post confirmation not received (toast/textarea did not clear).');
    }
  }

  private async extractTweetId(page: Page): Promise<string | null> {
    try {
      await page.waitForTimeout(2000);
      const urlMatch = page.url().match(/\/status\/(\d+)/);
      if (urlMatch) return urlMatch[1];

      const toast = page.locator(this.selectors.toast).first();
      if (await toast.isVisible().catch(() => false)) {
        const href = await toast
          .locator('a[href*="/status/"]')
          .first()
          .getAttribute('href')
          .catch(() => null);
        const m = href?.match(/\/status\/(\d+)/);
        if (m) return m[1];
      }
      return null;
    } catch {
      return null;
    }
  }

  async execute(opts: PostFlowOptions): Promise<PostResult> {
    this.validateText(opts.text);
    const { context, page } = await this.browser.launch(opts.accountId);

    try {
      await opts.navigate(page);
      await page.waitForTimeout(3000);
      await this.ensureLoggedIn(page, opts.accountId);

      const composer = await this.waitForComposer(page, opts.composerLabel, opts.accountId);
      await composer.click();
      await page.waitForTimeout(400 + Math.random() * 600);
      await this.typeHuman(composer, opts.text);
      await page.waitForTimeout(700 + Math.random() * 800);

      const paths = opts.mediaPaths && opts.mediaPaths.length > 0
        ? opts.mediaPaths
        : opts.mediaPath
          ? [opts.mediaPath]
          : [];
      if (paths.length > 0) {
        await this.attachMedia(page, paths, opts.altTexts ?? null);
      }

      await this.pressPostButton(page);
      await this.waitForPostConfirmation(page);

      const tweetId = await this.extractTweetId(page);
      const tweetUrl =
        tweetId && opts.username ? `https://x.com/${opts.username}/status/${tweetId}` : '';

      await page.waitForTimeout(2000);
      return { tweetId: tweetId ?? '', tweetUrl };
    } finally {
      await this.browser.release(context);
    }
  }
}
