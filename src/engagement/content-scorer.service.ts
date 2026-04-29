import { Injectable, Logger } from '@nestjs/common';
import { OpenRouterService } from '../content-generation/openrouter.service';
import type { ScrapedTweet } from './timeline-scraper.service';

const TECH_KEYWORDS = [
  'programming', 'developer', 'software', 'open source', 'open-source', 'opensource',
  'github', 'gitlab', 'code review', 'codebase', 'typescript', 'javascript', 'python',
  'rust', 'golang', 'react', 'vue', 'nextjs', 'node', 'docker', 'kubernetes',
  'api', 'database', 'backend', 'frontend', 'fullstack', 'devops', 'sre',
  'machine learning', 'ai', 'llm', 'gpt', 'claude', 'gemini',
  'startup', 'saas', 'indie hacker', 'build in public', 'side project',
  'css', 'html', 'web dev', 'webdev', '100daysofcode',
  'linux', 'terminal', 'cli', 'vim', 'neovim', 'vscode',
  'framework', 'library', 'package', 'npm', 'pip', 'cargo',
  'deploy', 'ci/cd', 'testing', 'debugging', 'refactor',
];

const SKIP_KEYWORDS = [
  'follow me', 'follow for follow', 'f4f', 'like for like', 'l4l',
  'retweet if', 'rt if', 'drop your', 'drop your @',
  'onlyfans', 'crypto scam', 'giveaway', 'follow friday', '#ff',
];

export interface ScoredTweet extends ScrapedTweet {
  relevanceScore: number;
  scoredBy: 'keyword' | 'llm' | 'skip';
}

@Injectable()
export class ContentScorer {
  private readonly log = new Logger(ContentScorer.name);

  constructor(private readonly llm: OpenRouterService) {}

  async score(tweets: ScrapedTweet[]): Promise<ScoredTweet[]> {
    const afterKeyword = tweets.map((t) => this.keywordScore(t));
    const skipped = afterKeyword.filter((t) => t.scoredBy === 'skip');
    const candidates = afterKeyword.filter((t) => t.scoredBy !== 'skip' && t.relevanceScore > 0);
    const belowThreshold = afterKeyword.filter((t) => t.scoredBy !== 'skip' && t.relevanceScore === 0);

    this.log.log(`Scoring: ${tweets.length} total → ${skipped.length} skipped → ${belowThreshold.length} below threshold → ${candidates.length} candidates`);

    if (candidates.length === 0) return [];

    const llmScored = await this.llmScore(candidates);
    return llmScored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private keywordScore(tweet: ScrapedTweet): ScoredTweet {
    const text = `${tweet.contentText} ${tweet.authorHandle}`.toLowerCase();

    for (const skip of SKIP_KEYWORDS) {
      if (text.includes(skip.toLowerCase())) {
        return { ...tweet, relevanceScore: 0, scoredBy: 'skip' };
      }
    }

    let score = 0;
    for (const kw of TECH_KEYWORDS) {
      if (text.includes(kw.toLowerCase())) {
        score += 1;
      }
    }

    if (tweet.likeCount > 100) score += 1;
    if (tweet.likeCount > 500) score += 1;

    const normalized = Math.min(score / 6, 1);
    return { ...tweet, relevanceScore: normalized, scoredBy: normalized > 0 ? 'keyword' : 'skip' };
  }

  private async llmScore(tweets: ScoredTweet[]): Promise<ScoredTweet[]> {
    const batchSize = 10;
    const results: ScoredTweet[] = [];

    for (let i = 0; i < tweets.length; i += batchSize) {
      const batch = tweets.slice(i, i + batchSize);
      try {
        const scores = await this.llmBatchScore(batch);
        for (let j = 0; j < batch.length; j++) {
          results.push({
            ...batch[j],
            relevanceScore: scores[j] ?? batch[j].relevanceScore * 0.5,
            scoredBy: 'llm',
          });
        }
      } catch (err) {
        this.log.warn(`LLM scoring failed, using keyword scores: ${err instanceof Error ? err.message : String(err)}`);
        results.push(...batch);
      }
    }

    return results;
  }

  private async llmBatchScore(tweets: ScoredTweet[]): Promise<number[]> {
    const tweetsText = tweets
      .map((t, i) => `[${i}] @${t.authorHandle}: "${t.contentText.slice(0, 200)}"`)
      .join('\n');

    const response = await this.llm.chat(
      [
        {
          role: 'system',
          content:
            'You are a relevance scorer for a tech/programming Twitter account. ' +
            'Score each tweet 0-1 for how valuable it would be to engage with (like/retweet). ' +
            'Consider: tech relevance, quality of content, engagement potential. ' +
            'Respond with ONLY a JSON array of numbers, no explanation. ' +
            'Example: [0.3, 0.8, 0.1]',
        },
        {
          role: 'user',
          content: `Score these tweets:\n${tweetsText}`,
        },
      ],
      200,
    );

    try {
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed.map((v: unknown) => typeof v === 'number' ? Math.max(0, Math.min(1, v)) : 0.3);
    } catch {
      this.log.warn(`Failed to parse LLM scores: ${response.slice(0, 100)}`);
    }
    return tweets.map(() => 0.3);
  }
}
