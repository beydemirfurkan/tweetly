import type { ConfigService } from '@nestjs/config';
import { OpenRouterService } from './openrouter.service';
import type { SettingsService } from '../settings/settings.service';
import type { TrendingRepo } from '../domain/types/content.types';

const REPO: TrendingRepo = {
  owner: 'octocat',
  name: 'hello-world',
  slug: 'octocat/hello-world',
  url: 'https://github.com/octocat/hello-world',
  description: 'My first repository on GitHub',
  language: 'TypeScript',
  starsToday: 100,
  totalStars: 5000,
};

function mockFetch(content: string) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => '',
  });
}

function createService(llmContent = 'test tweet') {
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      const map: Record<string, string> = {
        OPENROUTER_MODEL: 'google/gemini-2.5-flash',
        OPENROUTER_REFERER: 'https://github.com/test',
        OPENROUTER_APP_NAME: 'test',
      };
      return map[key] ?? fallback ?? '';
    }),
  } as unknown as ConfigService;
  const settings = {
    get: jest.fn().mockResolvedValue('test-api-key'),
  } as unknown as SettingsService;
  global.fetch = mockFetch(llmContent);
  return { service: new OpenRouterService(config, settings), config, settings };
}

describe('OpenRouterService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('chat()', () => {
    it('reads OpenRouter API key from database settings first', async () => {
      const config = {
        get: jest.fn((key: string, fallback?: string) => fallback),
      } as unknown as ConfigService;
      const settings = {
        get: jest.fn().mockResolvedValue('db-openrouter-key'),
      } as unknown as SettingsService;
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'cevap' } }] }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const service = new OpenRouterService(config, settings);
      const result = await service.chat([{ role: 'user', content: 'merhaba' }]);

      expect(result).toBe('cevap');
      expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer db-openrouter-key' }),
      }));
    });

    it('falls back to OPENROUTER_API_KEY env when no stored key', async () => {
      const config = {
        get: jest.fn((key: string, fallback?: string) => {
          if (key === 'OPENROUTER_API_KEY') return 'env-api-key';
          return fallback ?? '';
        }),
      } as unknown as ConfigService;
      const settings = { get: jest.fn().mockResolvedValue('') } as unknown as SettingsService;
      global.fetch = mockFetch('response');
      const service = new OpenRouterService(config, settings);
      await service.chat([{ role: 'user', content: 'test' }]);
      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer env-api-key');
    });

    it('throws when no API key is configured', async () => {
      const config = { get: jest.fn().mockReturnValue('') } as unknown as ConfigService;
      const settings = { get: jest.fn().mockResolvedValue('') } as unknown as SettingsService;
      const service = new OpenRouterService(config, settings);
      await expect(service.chat([{ role: 'user', content: 'test' }])).rejects.toThrow('API key not configured');
    });

    it('returns trimmed content string', async () => {
      const { service } = createService('  hello world  ');
      const result = await service.chat([{ role: 'user', content: 'test' }]);
      expect(result).toBe('hello world');
    });

    it('throws on non-OK HTTP response', async () => {
      const { service } = createService();
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: jest.fn().mockResolvedValue('rate limited'),
      });
      await expect(service.chat([{ role: 'user', content: 'test' }])).rejects.toThrow('429');
    });

    it('throws on AbortError timeout', async () => {
      const { service } = createService();
      global.fetch = jest.fn().mockRejectedValue(
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
      );
      await expect(service.chat([{ role: 'user', content: 'test' }])).rejects.toThrow('timeout');
    });

    it('rethrows non-abort network errors', async () => {
      const { service } = createService();
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.chat([{ role: 'user', content: 'test' }])).rejects.toThrow('ECONNREFUSED');
    });

    it('throws when choices array is empty', async () => {
      const { service } = createService();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ choices: [] }),
        text: jest.fn().mockResolvedValue(''),
      });
      await expect(service.chat([{ role: 'user', content: 'test' }])).rejects.toThrow('boş');
    });
  });

  describe('generateTweet()', () => {
    it('retries generated tweets that match artificial language patterns', async () => {
      const config = {
        get: jest.fn((key: string, fallback?: string) => fallback),
      } as unknown as ConfigService;
      const settings = {
        get: jest.fn().mockResolvedValue('db-openrouter-key'),
      } as unknown as SettingsService;
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'bu repo ilginç bir yöntem sunuyor, ne gibi yenilikler denenebilir merak ediyorum.' } }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'agent workflow kurarken asıl sorun hız değil, nerede duracağını bilmesi. bu repo o sınırı tarif etmeye çalışıyor.' } }] }),
        });
      global.fetch = fetchMock as unknown as typeof fetch;

      const service = new OpenRouterService(config, settings);
      const result = await service.generateTweet({
        owner: 'acme', name: 'agent-rules', slug: 'acme/agent-rules',
        url: 'https://github.com/acme/agent-rules', description: 'agent workflow rules',
        language: 'typescript', starsToday: 100, totalStars: 500,
      });

      expect(result).toBe('agent workflow kurarken asıl sorun hız değil, nerede duracağını bilmesi. bu repo o sınırı tarif etmeye çalışıyor.');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('returns cleaned tweet text', async () => {
      const { service } = createService('typescript ile güzel bir araç');
      const result = await service.generateTweet(REPO, 'repo_drop');
      expect(result).toBe('typescript ile güzel bir araç');
    });

    it('strips code fences from response', async () => {
      const { service } = createService('```\ntweet metni burada\n```');
      const result = await service.generateTweet(REPO, 'no_link_hook');
      expect(result).not.toContain('```');
      expect(result).toBe('tweet metni burada');
    });

    it('retries when first response is too long', async () => {
      const { service: svc } = createService();
      const longText = 'a'.repeat(801);
      const shortText = 'kısa tweet';
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: longText } }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: shortText } }] }) });
      const result = await svc.generateTweet(REPO, 'repo_drop');
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toBe(shortText);
    });

    it('throws when tweet still too long after retry', async () => {
      const { service } = createService('a'.repeat(801));
      await expect(service.generateTweet(REPO)).rejects.toThrow('pratik uzunluk');
    });

    it('throws when artificial language persists after retry', async () => {
      const { service } = createService('bu yazıda ilginç bir yöntem sunuyor merak ediyorum');
      await expect(service.generateTweet(REPO)).rejects.toThrow('yapay dil');
    });
  });

  describe('generateThread()', () => {
    it('splits tweets by --- separator', async () => {
      const { service } = createService('tweet bir\n---\ntweet iki\n---\nrepo: https://github.com/octocat/hello-world');
      const result = await service.generateThread(REPO, REPO.url);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('appends repo url to last tweet when missing', async () => {
      const { service } = createService('tweet bir\n---\ntweet iki yorum');
      const result = await service.generateThread(REPO, REPO.url);
      expect(result[result.length - 1]).toContain('github.com');
    });

    it('does not duplicate url when already present in last tweet', async () => {
      const url = 'https://github.com/octocat/hello-world';
      const { service } = createService(`tweet bir\n---\nrepo: ${url}`);
      const result = await service.generateThread(REPO, url);
      const lastTweet = result[result.length - 1];
      const count = (lastTweet.match(/github\.com/g) ?? []).length;
      expect(count).toBe(1);
    });

    it('returns at most 3 tweets', async () => {
      const tweets = Array.from({ length: 5 }, (_, i) => `tweet ${i + 1}`).join('\n---\n');
      const { service } = createService(tweets);
      const result = await service.generateThread(REPO, REPO.url);
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('throws when no valid tweets produced after retry', async () => {
      const { service: svc } = createService();
      // Whitespace passes chat()'s non-empty check but produces no tweets after trim+filter
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '   ' } }] }),
      });
      await expect(svc.generateThread(REPO, REPO.url)).rejects.toThrow('Thread');
    });
  });

  describe('generateDigest()', () => {
    it('returns cleaned digest text', async () => {
      const { service } = createService('haftanın trending repoları özeti');
      const result = await service.generateDigest([REPO]);
      expect(result).toBe('haftanın trending repoları özeti');
    });

    it('retries when digest is too long', async () => {
      const { service: svc } = createService();
      const long = 'a'.repeat(801);
      const short = 'kısa özet';
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: long } }] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: short } }] }) });
      const result = await svc.generateDigest([REPO]);
      expect(result).toBe(short);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('throws when digest has artificial language after retry', async () => {
      const { service } = createService('bu yazıda değerli bilgiler içeriyor merak ediyorum');
      await expect(service.generateDigest([REPO])).rejects.toThrow('yapay dil');
    });
  });
});
