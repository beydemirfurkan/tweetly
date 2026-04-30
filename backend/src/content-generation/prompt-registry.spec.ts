import {
  getFormatConfig,
  getSystemPrompt,
  userPromptForFormat,
  userPromptForDigest,
  RETRY_USER_NOTE,
  RETRY_THREAD_NOTE,
  RETRY_NATURALNESS_NOTE,
  FORMATS,
} from './prompt-registry';
import type { TrendingRepo } from '../domain/types/content.types';

const REPO: TrendingRepo = {
  owner: 'octocat',
  name: 'hello-world',
  slug: 'octocat/hello-world',
  url: 'https://github.com/octocat/hello-world',
  description: 'My first repository',
  language: 'TypeScript',
  starsToday: 50,
  totalStars: 1000,
};

const EXTERNAL_REPO: TrendingRepo = {
  ...REPO,
  owner: 'hacker-news',
  name: 'New AI Tool',
  slug: 'hacker-news/new-ai-tool-abc123',
  url: 'https://example.com/ai-tool',
  sourceType: 'discussion',
  sourceId: 'hacker_news',
  sourceName: 'Hacker News',
  discussionCount: 42,
  publishedAt: '2024-01-01T00:00:00Z',
};

describe('prompt-registry', () => {
  describe('getFormatConfig()', () => {
    it('returns config for all known formats', () => {
      const formats = Object.keys(FORMATS) as Array<keyof typeof FORMATS>;
      for (const fmt of formats) {
        const cfg = getFormatConfig(fmt);
        expect(cfg.format).toBe(fmt);
        expect(typeof cfg.systemPrompt).toBe('string');
        expect(cfg.systemPrompt.length).toBeGreaterThan(0);
      }
    });

    it('throws for unknown format', () => {
      expect(() => getFormatConfig('unknown_format' as any)).toThrow('Unknown content format');
    });
  });

  describe('getSystemPrompt()', () => {
    it('returns non-empty prompt for repo_drop', () => {
      const prompt = getSystemPrompt('repo_drop');
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('returns non-empty prompt for mini_thread', () => {
      const prompt = getSystemPrompt('mini_thread');
      expect(prompt).toContain('thread');
    });

    it('returns different prompts for different formats', () => {
      const p1 = getSystemPrompt('repo_drop');
      const p2 = getSystemPrompt('hot_take');
      expect(p1).not.toBe(p2);
    });
  });

  describe('userPromptForFormat()', () => {
    it('includes repo owner/name for github source', () => {
      const prompt = userPromptForFormat('repo_drop', REPO);
      expect(prompt).toContain('octocat/hello-world');
    });

    it('includes repo url', () => {
      const prompt = userPromptForFormat('repo_drop', REPO);
      expect(prompt).toContain(REPO.url);
    });

    it('includes description', () => {
      const prompt = userPromptForFormat('repo_drop', REPO);
      expect(prompt).toContain(REPO.description);
    });

    it('includes language', () => {
      const prompt = userPromptForFormat('repo_drop', REPO);
      expect(prompt).toContain('TypeScript');
    });

    it('includes starsToday', () => {
      const prompt = userPromptForFormat('repo_drop', REPO);
      expect(prompt).toContain('50');
    });

    it('includes extraContext when provided', () => {
      const prompt = userPromptForFormat('repo_drop', REPO, 'ekstra bağlam bilgisi');
      expect(prompt).toContain('ekstra bağlam bilgisi');
    });

    it('includes discussion count and publishedAt for external source', () => {
      const prompt = userPromptForFormat('no_link_hook', EXTERNAL_REPO);
      expect(prompt).toContain('42');
      expect(prompt).toContain('2024-01-01');
    });

    it('mentions link when format needsLink is true', () => {
      const prompt = userPromptForFormat('sponsor_native', { ...REPO });
      expect(prompt.toLowerCase()).toContain('link');
    });

    it('says no link when format needsLink is false', () => {
      const prompt = userPromptForFormat('repo_drop', REPO);
      expect(prompt).toContain('YOK');
    });

    it('includes thread instruction for mini_thread format', () => {
      const prompt = userPromptForFormat('mini_thread', REPO);
      expect(prompt).toContain('---');
    });

    it('includes source name for external repo', () => {
      const prompt = userPromptForFormat('no_link_hook', EXTERNAL_REPO);
      expect(prompt).toContain('Hacker News');
    });
  });

  describe('userPromptForDigest()', () => {
    it('includes repo names in output', () => {
      const prompt = userPromptForDigest([REPO]);
      expect(prompt).toContain('octocat/hello-world');
    });

    it('limits to 7 repos', () => {
      const repos = Array.from({ length: 10 }, (_, i) => ({
        ...REPO,
        owner: `owner${i}`,
        name: `repo${i}`,
        slug: `owner${i}/repo${i}`,
      }));
      const prompt = userPromptForDigest(repos);
      const matches = prompt.match(/owner\d/g) ?? [];
      expect(matches.length).toBeLessThanOrEqual(7);
    });

    it('includes description snippet', () => {
      const prompt = userPromptForDigest([REPO]);
      expect(prompt).toContain('My first repository');
    });
  });

  describe('retry notes', () => {
    it('RETRY_USER_NOTE mentions 800 karakter', () => {
      expect(RETRY_USER_NOTE).toContain('800');
    });

    it('RETRY_THREAD_NOTE mentions thread', () => {
      expect(RETRY_THREAD_NOTE.toLowerCase()).toContain('thread');
    });

    it('RETRY_NATURALNESS_NOTE mentions yapay', () => {
      expect(RETRY_NATURALNESS_NOTE).toContain('yapay');
    });
  });
});
