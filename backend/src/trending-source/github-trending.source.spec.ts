import { GithubTrendingSource } from './github-trending.source';

const SAMPLE_HTML = `
<article class="Box-row">
  <h2><a href="/octocat/hello-world">octocat / hello-world</a></h2>
  <p>My first repository on GitHub!</p>
  <span itemprop="programmingLanguage">JavaScript</span>
  <a class="Link--muted" href="/octocat/hello-world/stargazers">1,234</a>
  <span class="d-inline-block float-sm-right">56 stars today</span>
</article>
<article class="Box-row">
  <h2><a href="/owner/repo-two">owner / repo-two</a></h2>
  <p>Second repo</p>
  <span itemprop="programmingLanguage">TypeScript</span>
  <a class="Link--muted" href="/owner/repo-two/stargazers">5,000</a>
  <span class="d-inline-block float-sm-right">120 stars today</span>
</article>
`;

function mockFetchOk(html = SAMPLE_HTML) {
  return jest.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(html),
  });
}

describe('GithubTrendingSource', () => {
  let source: GithubTrendingSource;

  beforeEach(() => {
    source = new GithubTrendingSource();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchTrending()', () => {
    it('parses repos from valid HTML', async () => {
      global.fetch = mockFetchOk();
      const repos = await source.fetchTrending();
      expect(repos).toHaveLength(2);
      expect(repos[0].owner).toBe('octocat');
      expect(repos[0].name).toBe('hello-world');
      expect(repos[0].language).toBe('JavaScript');
      expect(repos[0].starsToday).toBe(56);
      expect(repos[0].totalStars).toBe(1234);
    });

    it('builds correct URL with since=weekly', async () => {
      global.fetch = mockFetchOk();
      await source.fetchTrending({ since: 'weekly' });
      const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain('since=weekly');
    });

    it('includes language in URL path when specified', async () => {
      global.fetch = mockFetchOk();
      await source.fetchTrending({ language: 'rust' });
      const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain('/trending/rust');
    });

    it('throws on non-OK HTTP response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });
      await expect(source.fetchTrending()).rejects.toThrow('429');
    });

    it('re-throws network errors', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(source.fetchTrending()).rejects.toThrow('ECONNREFUSED');
    });

    it('throws timeout error on AbortError', async () => {
      global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      await expect(source.fetchTrending()).rejects.toThrow('timeout');
    });

    it('returns empty array for HTML with no articles', async () => {
      global.fetch = mockFetchOk('<html><body></body></html>');
      const repos = await source.fetchTrending();
      expect(repos).toHaveLength(0);
    });

    it('skips articles missing href', async () => {
      const html = `<article class="Box-row"><h2><a href="">no slug</a></h2></article>`;
      global.fetch = mockFetchOk(html);
      const repos = await source.fetchTrending();
      expect(repos).toHaveLength(0);
    });

    it('includes User-Agent header in request', async () => {
      global.fetch = mockFetchOk();
      await source.fetchTrending();
      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)?.['User-Agent']).toContain('Mozilla');
    });
  });
});
