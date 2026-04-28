import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import type { Locator, Page } from 'patchright';
import { XBrowserService } from './x-browser.service';
import { SelectorRegistry } from './selector-registry';

const AUTH_REQUIRED_PREFIX = 'AUTH_REQUIRED:';
const MAX_TWEET_LEN = 280;

export interface PostResult {
  tweetId: string;
  tweetUrl: string;
}

export interface PostFlowOptions {
  text: string;
  username: string;
  accountId?: string;
  mediaPath?: string | null;
  navigate: (page: Page) => Promise<void>;
  composerLabel: string;
  errorPrefix: 'post' | 'reply' | 'quote';
}

export class AuthRequiredError extends Error {
  constructor(message: string) {
    super(`${AUTH_REQUIRED_PREFIX} ${message}`);
    this.name = 'AuthRequiredError';
  }
}

export function isAuthRequiredError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.startsWith(AUTH_REQUIRED_PREFIX);
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
      throw new Error('postTweet: boş metin');
    }
    if (text.length > MAX_TWEET_LEN) {
      throw new Error(`postTweet: metin ${MAX_TWEET_LEN} karakteri aşıyor (${text.length})`);
    }
  }

  private async typeHuman(locator: Locator, text: string): Promise<void> {
    for (const ch of text) {
      await locator.type(ch, { delay: 30 + Math.floor(Math.random() * 60) });
    }
  }

  private async ensureLoggedIn(page: Page): Promise<void> {
    if (page.url().includes('/login') || page.url().includes('/i/flow')) {
      throw new AuthRequiredError('Session geçersiz — auth_token ile session import gerekli.');
    }
  }

  private async waitForComposer(page: Page, label: string): Promise<Locator> {
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
        if (page.url() === 'https://x.com/' || title.includes('Olan biten burada')) {
          throw new AuthRequiredError(`X logged-out görünüyor. URL=${page.url()} title=${title}. ${detail}`);
        }
        throw new Error(`${label} bulunamadı. URL=${page.url()} title=${title}. ${detail}`);
      }
    }
  }

  private async attachMedia(page: Page, mediaPath: string): Promise<void> {
    if (!fs.existsSync(mediaPath)) {
      this.log.warn(`Media bulunamadı, atlanıyor: ${mediaPath}`);
      return;
    }
    const fileInput = page.locator(this.selectors.mediaInput).first();
    try {
      await fileInput.waitFor({ state: 'attached', timeout: 5000 });
      await fileInput.setInputFiles(mediaPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`Media file input bulunamadı (${msg}), text-only gönderilecek.`);
      return;
    }
    try {
      await page.waitForSelector(this.selectors.mediaAttached, { timeout: 20000 });
      this.log.log(`Media yüklendi: ${path.basename(mediaPath)}`);
    } catch {
      this.log.warn('Media upload preview görünmedi (timeout). Yine de devam ediliyor.');
    }
    await page.waitForTimeout(800 + Math.random() * 600);
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
      throw new Error('Post butonu disabled — metinde sorun olabilir.');
    }
    try {
      await postBtn.click({ timeout: 5000 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`Post butonu normal click başarısız, DOM click deneniyor: ${msg}`);
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
      throw new Error('Post sonrası onay alınamadı (toast/textarea boşalmadı).');
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
      await this.ensureLoggedIn(page);

      const composer = await this.waitForComposer(page, opts.composerLabel);
      await composer.click();
      await page.waitForTimeout(400 + Math.random() * 600);
      await this.typeHuman(composer, opts.text);
      await page.waitForTimeout(700 + Math.random() * 800);

      if (opts.mediaPath) {
        await this.attachMedia(page, opts.mediaPath);
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
