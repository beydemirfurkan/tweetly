import fs from 'fs';
import os from 'os';
import path from 'path';
import { MediaService, __testing } from './media.service';
import type { TrendingRepo } from '../domain/types/content.types';

const { extractImageCandidates, isLikelyHeroImage, resolveImageUrl, pickExtension } = __testing;

const repo: TrendingRepo = {
  owner: 'octocat',
  name: 'hello-world',
  slug: 'octocat/hello-world',
  url: 'https://github.com/octocat/hello-world',
  description: '',
  language: '',
  starsToday: 0,
  totalStars: 0,
  sourceType: 'github',
};

describe('media.service helpers', () => {
  describe('extractImageCandidates', () => {
    it('parses markdown image syntax', () => {
      const md = `# Title\n\n![hero shot](docs/hero.png)\n\nbody`;
      const out = extractImageCandidates(md);
      expect(out).toEqual([{ alt: 'hero shot', url: 'docs/hero.png', rawTag: null }]);
    });

    it('parses html img tags with alt', () => {
      const md = `<p><img src="https://example.com/a.png" alt="demo"></p>`;
      const out = extractImageCandidates(md);
      expect(out).toHaveLength(1);
      expect(out[0]?.url).toBe('https://example.com/a.png');
      expect(out[0]?.alt).toBe('demo');
      expect(out[0]?.rawTag).toContain('<img');
    });

    it('returns multiple images in document order', () => {
      const md = `![one](a.png)\n<img src="b.png" alt="two">\n![three](c.png)`;
      const out = extractImageCandidates(md);
      expect(out.map((c) => c.url)).toEqual(['a.png', 'c.png', 'b.png']);
    });
  });

  describe('isLikelyHeroImage', () => {
    it('rejects shields.io badges', () => {
      expect(
        isLikelyHeroImage({
          url: 'https://img.shields.io/npm/v/foo.svg',
          alt: 'npm',
          rawTag: null,
        }),
      ).toBe(false);
    });

    it('rejects github actions badges', () => {
      expect(
        isLikelyHeroImage({
          url: 'https://github.com/foo/bar/actions/workflows/ci.yml/badge.svg',
          alt: '',
          rawTag: null,
        }),
      ).toBe(false);
    });

    it('rejects svg files generally (likely logos)', () => {
      expect(
        isLikelyHeroImage({
          url: 'https://example.com/logo.svg',
          alt: '',
          rawTag: null,
        }),
      ).toBe(false);
    });

    it('rejects images with logo/badge keywords in alt', () => {
      expect(
        isLikelyHeroImage({
          url: 'https://example.com/x.png',
          alt: 'Build Status',
          rawTag: null,
        }),
      ).toBe(false);
    });

    it('rejects narrow html images (width < 200)', () => {
      expect(
        isLikelyHeroImage({
          url: 'https://example.com/x.png',
          alt: '',
          rawTag: '<img src="x.png" width="80" height="80">',
        }),
      ).toBe(false);
    });

    it('accepts a plausible hero gif', () => {
      expect(
        isLikelyHeroImage({
          url: 'https://raw.githubusercontent.com/foo/bar/HEAD/docs/hero.gif',
          alt: 'product demo',
          rawTag: null,
        }),
      ).toBe(true);
    });

    it('accepts a plausible hero png with no extension hints', () => {
      expect(
        isLikelyHeroImage({
          url: 'https://user-images.githubusercontent.com/123/abc.png',
          alt: 'screenshot',
          rawTag: null,
        }),
      ).toBe(true);
    });
  });

  describe('resolveImageUrl', () => {
    it('keeps absolute https urls as is', () => {
      expect(resolveImageUrl('https://example.com/a.png', 'o', 'r')).toBe(
        'https://example.com/a.png',
      );
    });

    it('rewrites github blob urls to raw.githubusercontent.com', () => {
      expect(
        resolveImageUrl('https://github.com/o/r/blob/main/docs/hero.png', 'o', 'r'),
      ).toBe('https://raw.githubusercontent.com/o/r/main/docs/hero.png');
    });

    it('resolves relative paths against HEAD on raw cdn', () => {
      expect(resolveImageUrl('docs/hero.png', 'octocat', 'hello')).toBe(
        'https://raw.githubusercontent.com/octocat/hello/HEAD/docs/hero.png',
      );
    });

    it('strips leading ./ and / from relative paths', () => {
      expect(resolveImageUrl('./docs/a.png', 'o', 'r')).toBe(
        'https://raw.githubusercontent.com/o/r/HEAD/docs/a.png',
      );
      expect(resolveImageUrl('/docs/a.png', 'o', 'r')).toBe(
        'https://raw.githubusercontent.com/o/r/HEAD/docs/a.png',
      );
    });

    it('upgrades protocol-relative urls to https', () => {
      expect(resolveImageUrl('//example.com/a.png', 'o', 'r')).toBe('https://example.com/a.png');
    });
  });

  describe('pickExtension', () => {
    it('prefers content-type when known', () => {
      expect(pickExtension('https://x/a', 'image/png', undefined)).toBe('png');
      expect(pickExtension('https://x/a', 'image/jpeg; charset=utf-8', undefined)).toBe('jpg');
    });

    it('falls back to url extension', () => {
      expect(pickExtension('https://x/a.gif?x=1', '', undefined)).toBe('gif');
      expect(pickExtension('https://x/a.JPEG', '', undefined)).toBe('jpg');
    });

    it('returns fallback when nothing else matches', () => {
      expect(pickExtension('https://x/a', '', 'png')).toBe('png');
    });

    it('returns null on unsupported types', () => {
      expect(pickExtension('https://x/a.svg', 'image/svg+xml', undefined)).toBe(null);
    });
  });
});

describe('MediaService.fetchReadmeHeroImage (integration with mocked fetch)', () => {
  const originalFetch = global.fetch;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-svc-'));
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
    jest.restoreAllMocks();
  });

  it('returns null when README has no images', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Map(),
      arrayBuffer: async () => Buffer.from('# title\n\nno images here'),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const svc = new MediaService();
    const out = await svc.fetchReadmeHeroImage(repo);
    expect(out).toBeNull();
  });

  it('returns null when source is not github', async () => {
    const svc = new MediaService();
    const out = await svc.fetchReadmeHeroImage({ ...repo, sourceType: 'article' });
    expect(out).toBeNull();
  });

  it('skips badges and downloads first hero candidate', async () => {
    const readmeBody = Buffer.from(
      `[![build](https://img.shields.io/github/actions/workflow/x/build.svg)](x)\n` +
        `\n# Hello\n\n![demo](docs/hero.gif)\n`,
    );
    const imageBody = Buffer.alloc(2048, 0xab);

    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('api.github.com')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'text/plain' },
          arrayBuffer: async () => readmeBody,
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'image/gif' : null) },
        arrayBuffer: async () => imageBody,
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const svc = new MediaService();
    const out = await svc.fetchReadmeHeroImage(repo);
    expect(out).not.toBeNull();
    expect(fs.existsSync(out as string)).toBe(true);
    expect(out).toMatch(/hero-\d+\.gif$/);

    // İkinci fetch çağrısı raw.githubusercontent.com'a olmalı (HEAD).
    const imageUrl = fetchMock.mock.calls[1]?.[0];
    expect(imageUrl).toBe('https://raw.githubusercontent.com/octocat/hello-world/HEAD/docs/hero.gif');
  });
});
