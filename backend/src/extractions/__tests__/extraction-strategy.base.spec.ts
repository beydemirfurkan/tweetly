import { ExtractionStrategyBase } from '../strategies/extraction-strategy.base';
import type { ExtractionFetchArgs } from '../strategies/extraction-strategy.port';
import type { PaginatedResult } from '@/x-automation/x-direct';

class TestStrategy extends ExtractionStrategyBase {
  readonly type = 'user_followers' as const;
  async fetch(_args: ExtractionFetchArgs): Promise<PaginatedResult<unknown>> {
    return { items: [], nextCursor: null };
  }
  // Expose protected helpers for direct assertions.
  handle = this.requireHandle.bind(this);
  tweetUrl = this.requireTweetUrl.bind(this);
  query = this.requireQuery.bind(this);
  listId = this.requireListId.bind(this);
}

const s = new TestStrategy();

describe('ExtractionStrategyBase parameter guards', () => {
  it('requireHandle throws when handle is missing', () => {
    expect(() => s.handle({})).toThrow(/params\.handle is required/);
    expect(s.handle({ handle: 'alice' })).toBe('alice');
  });

  it('requireTweetUrl throws when tweetUrl is missing', () => {
    expect(() => s.tweetUrl({})).toThrow(/params\.tweetUrl is required/);
    expect(s.tweetUrl({ tweetUrl: 'https://x.com/u/status/1' })).toBe('https://x.com/u/status/1');
  });

  it('requireQuery throws when query is missing', () => {
    expect(() => s.query({})).toThrow(/params\.query is required/);
    expect(s.query({ query: 'foo' })).toBe('foo');
  });

  it('requireListId throws when listId is missing', () => {
    expect(() => s.listId({})).toThrow(/params\.listId is required/);
    expect(s.listId({ listId: '42' })).toBe('42');
  });
});
