import { ExternalTechSource } from './external-tech.source';

const HN_IDS = [1, 2, 3];
const HN_ITEM = {
  id: 1, type: 'story',
  title: 'New AI Tool Released',
  url: 'https://example.com/ai-tool',
  score: 300,
  descendants: 42,
  time: 1700000000,
};
const DEVTO_ARTICLE = {
  id: 10,
  title: 'TypeScript Best Practices',
  description: 'Learn TypeScript well',
  url: 'https://dev.to/user/ts-post',
  published_at: '2024-01-01T00:00:00Z',
  tag_list: ['typescript', 'webdev'],
  public_reactions_count: 150,
  comments_count: 20,
  user: { username: 'devuser', name: 'Dev User' },
};

function setupFetch(responses: Array<{ ok: boolean; json?: unknown }>) {
  let call = 0;
  global.fetch = jest.fn().mockImplementation(() => {
    const r = responses[call++] ?? responses[responses.length - 1];
    return Promise.resolve({
      ok: r.ok,
      status: r.ok ? 200 : 500,
      statusText: r.ok ? 'OK' : 'Error',
      json: () => Promise.resolve(r.json),
    });
  });
}

describe('ExternalTechSource', () => {
  let source: ExternalTechSource;

  beforeEach(() => {
    source = new ExternalTechSource();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchCandidates()', () => {
    it('fetches from both HN and dev.to by default', async () => {
      setupFetch([
        { ok: true, json: HN_IDS },
        { ok: true, json: HN_ITEM },
        { ok: true, json: HN_ITEM },
        { ok: true, json: HN_ITEM },
        { ok: true, json: [DEVTO_ARTICLE] },
      ]);
      const results = await source.fetchCandidates({ hackerNewsLimit: 3, devToLimit: 1 });
      expect(results.length).toBeGreaterThan(0);
    });

    it('skips HN when includeHackerNews=false', async () => {
      setupFetch([{ ok: true, json: [DEVTO_ARTICLE] }]);
      const results = await source.fetchCandidates({ includeHackerNews: false, devToLimit: 1 });
      expect(results.some((r) => r.sourceId === 'dev_to')).toBe(true);
      expect(results.some((r) => r.sourceId === 'hacker_news')).toBe(false);
    });

    it('skips dev.to when includeDevTo=false', async () => {
      setupFetch([
        { ok: true, json: [1] },
        { ok: true, json: HN_ITEM },
      ]);
      const results = await source.fetchCandidates({ includeDevTo: false, hackerNewsLimit: 1 });
      expect(results.some((r) => r.sourceId === 'hacker_news')).toBe(true);
      expect(results.some((r) => r.sourceId === 'dev_to')).toBe(false);
    });

    it('returns empty array when both sources fail', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
      const results = await source.fetchCandidates();
      expect(results).toHaveLength(0);
    });

    it('returns partial results when one source fails', async () => {
      // Parallel fetch order: call 0 = HN topstories, call 1 = dev.to (fails), call 2 = HN item
      setupFetch([
        { ok: true, json: [1] },
        { ok: false, json: [] },
        { ok: true, json: HN_ITEM },
      ]);
      const results = await source.fetchCandidates({ hackerNewsLimit: 1 });
      expect(results.some((r) => r.sourceId === 'hacker_news')).toBe(true);
    });
  });

  describe('HN candidate mapping', () => {
    it('maps HN item fields correctly', async () => {
      // Parallel fetch order: call 0 = HN topstories, call 1 = dev.to (empty), call 2 = HN item
      setupFetch([
        { ok: true, json: [1] },
        { ok: true, json: [] },
        { ok: true, json: HN_ITEM },
      ]);
      const results = await source.fetchCandidates({ hackerNewsLimit: 1 });
      const hn = results.find((r) => r.sourceId === 'hacker_news');
      expect(hn).toBeDefined();
      expect(hn!.owner).toBe('hacker-news');
      expect(hn!.starsToday).toBe(300);
      expect(hn!.discussionCount).toBe(42);
      expect(hn!.url).toBe('https://example.com/ai-tool');
    });

    it('filters out non-story HN items', async () => {
      // call 0 = topstories, call 1 = dev.to empty, call 2+3 = HN items
      setupFetch([
        { ok: true, json: [1, 2] },
        { ok: true, json: [] },
        { ok: true, json: { ...HN_ITEM, type: 'comment' } },
        { ok: true, json: HN_ITEM },
      ]);
      const results = await source.fetchCandidates({ hackerNewsLimit: 2 });
      const hn = results.filter((r) => r.sourceId === 'hacker_news');
      expect(hn).toHaveLength(1);
    });
  });

  describe('dev.to candidate mapping', () => {
    it('maps dev.to article fields correctly', async () => {
      // HN disabled → only 1 fetch call: dev.to articles
      setupFetch([{ ok: true, json: [DEVTO_ARTICLE] }]);
      const results = await source.fetchCandidates({ includeHackerNews: false, devToLimit: 1 });
      const devto = results.find((r) => r.sourceId === 'dev_to');
      expect(devto).toBeDefined();
      expect(devto!.owner).toBe('devuser');
      expect(devto!.starsToday).toBe(150);
      expect(devto!.discussionCount).toBe(20);
      expect(devto!.language).toContain('typescript');
    });

    it('filters out articles missing title or url', async () => {
      // HN disabled → only 1 fetch call: dev.to articles
      setupFetch([{ ok: true, json: [{ id: 99 }] }]);
      const results = await source.fetchCandidates({ includeHackerNews: false });
      expect(results.filter((r) => r.sourceId === 'dev_to')).toHaveLength(0);
    });
  });
});
