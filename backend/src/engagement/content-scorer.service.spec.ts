import { ContentScorer } from './content-scorer.service';
import type { ScrapedTweet } from './timeline-scraper.service';

function makeTweet(overrides: Partial<ScrapedTweet> = {}): ScrapedTweet {
  return {
    tweetUrl: 'https://x.com/user/status/1',
    authorHandle: 'user',
    contentText: 'hello world',
    likeCount: 0,
    ...overrides,
  };
}

function createScorer(llmResponse = '[0.8]') {
  const llm = { chat: jest.fn().mockResolvedValue(llmResponse) };
  const scorer = new ContentScorer(llm as any);
  return { scorer, llm };
}

describe('ContentScorer', () => {
  describe('score()', () => {
    it('returns empty array when all tweets are skipped', async () => {
      const { scorer } = createScorer();
      const tweet = makeTweet({ contentText: 'follow me for follow back f4f' });
      const results = await scorer.score([tweet]);
      expect(results).toHaveLength(0);
    });

    it('returns empty array for tweets with no keyword hits', async () => {
      const { scorer } = createScorer();
      const tweet = makeTweet({ contentText: 'nice day outside today' });
      const results = await scorer.score([tweet]);
      expect(results).toHaveLength(0);
    });

    it('scores tech tweets through LLM', async () => {
      const { scorer, llm } = createScorer('[0.9]');
      const tweet = makeTweet({ contentText: 'typescript is amazing for software development' });
      const results = await scorer.score([tweet]);
      expect(llm.chat).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
      expect(results[0].scoredBy).toBe('llm');
      expect(results[0].relevanceScore).toBe(0.9);
    });

    it('returns empty array when no tweets provided', async () => {
      const { scorer } = createScorer();
      const results = await scorer.score([]);
      expect(results).toHaveLength(0);
    });

    it('falls back to keyword score when LLM throws', async () => {
      const { scorer, llm } = createScorer();
      llm.chat.mockRejectedValue(new Error('LLM error'));
      const tweet = makeTweet({ contentText: 'typescript react docker kubernetes' });
      const results = await scorer.score([tweet]);
      expect(results).toHaveLength(1);
      expect(results[0].scoredBy).toBe('keyword');
    });

    it('sorts results by relevance descending', async () => {
      const { scorer } = createScorer('[0.2, 0.9, 0.5]');
      const tweets = [
        makeTweet({ tweetUrl: 'https://x.com/u/1', contentText: 'react typescript frontend' }),
        makeTweet({ tweetUrl: 'https://x.com/u/2', contentText: 'docker kubernetes devops' }),
        makeTweet({ tweetUrl: 'https://x.com/u/3', contentText: 'python machine learning ai' }),
      ];
      const results = await scorer.score(tweets);
      expect(results[0].relevanceScore).toBeGreaterThanOrEqual(results[1].relevanceScore);
      expect(results[1].relevanceScore).toBeGreaterThanOrEqual(results[2].relevanceScore);
    });

    it('boosts score for high like count', async () => {
      const { scorer, llm } = createScorer('[0.9]');
      const highLike = makeTweet({ contentText: 'typescript programming', likeCount: 600 });
      await scorer.score([highLike]);
      expect(llm.chat).toHaveBeenCalled();
    });
  });

  describe('LLM score parsing', () => {
    it('handles JSON array with code fence in LLM response', async () => {
      const { scorer } = createScorer('```json\n[0.7]\n```');
      const tweet = makeTweet({ contentText: 'react typescript node.js development' });
      const results = await scorer.score([tweet]);
      expect(results[0].relevanceScore).toBe(0.7);
    });

    it('falls back to 0.3 when LLM returns invalid JSON', async () => {
      const { scorer } = createScorer('not valid json at all');
      const tweet = makeTweet({ contentText: 'python machine learning ai llm' });
      const results = await scorer.score([tweet]);
      expect(results[0].relevanceScore).toBe(0.3);
    });

    it('clamps LLM scores to [0,1]', async () => {
      const { scorer } = createScorer('[1.5, -0.3]');
      const tweets = [
        makeTweet({ tweetUrl: 'https://x.com/u/1', contentText: 'react javascript programming' }),
        makeTweet({ tweetUrl: 'https://x.com/u/2', contentText: 'docker kubernetes devops sre' }),
      ];
      const results = await scorer.score(tweets);
      for (const r of results) {
        expect(r.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(r.relevanceScore).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('skip keywords', () => {
    const skipPhrases = ['follow me', 'retweet if', 'drop your', 'onlyfans', 'giveaway'];
    for (const phrase of skipPhrases) {
      it(`skips tweet containing "${phrase}"`, async () => {
        const { scorer } = createScorer();
        const tweet = makeTweet({ contentText: `${phrase} typescript developer` });
        const results = await scorer.score([tweet]);
        expect(results).toHaveLength(0);
      });
    }
  });
});
