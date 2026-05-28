import { Inject, Injectable, Logger } from '@nestjs/common';
import { LLM_CLIENT, type ILlmClient } from '../llm/llm-client.port';
import type { ViralScoreRequest, ViralScoreResult } from '../types/viral-score.types';

@Injectable()
export class ViralScorerService {
  private readonly logger = new Logger(ViralScorerService.name);

  constructor(@Inject(LLM_CLIENT) private readonly ai: ILlmClient) {}

  async score(request: ViralScoreRequest): Promise<ViralScoreResult> {
    const { text, format, handle } = request;

    this.logger.log(`Scoring tweet: ${text.length} chars, handle=${handle ?? 'n/a'}`);

    const result = await this.ai.chat(
      [
        {
          role: 'system',
          content: `You are an X (Twitter) algorithm expert. You score tweets for viral potential based on:
1. Hook strength (first line stops the scroll)
2. Emotional trigger (curiosity, surprise, controversy, value)
3. Readability (short sentences, line breaks, scannable)
4. Format fit (appropriate length and structure)
5. Engagement bait (induces replies, retweets, bookmarks)

Always respond with valid JSON only, no markdown fences.`,
        },
        {
          role: 'user',
          content: `Score this tweet for viral potential:

"${text}"

${format ? `Format: ${format}` : ''}
${handle ? `Author: @${handle}` : ''}

Respond with JSON:
{
  "score": 7.5,
  "maxScore": 10,
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1"],
  "suggestions": ["improvement1", "improvement2"],
  "estimatedReach": "5K-50K",
  "formatFit": 8,
  "hookStrength": 7,
  "readabilityScore": 9
}`,
        },
      ],
      { temperature: 0.2, maxTokens: 2048 },
    );

    try {
      const cleaned = result.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned) as ViralScoreResult;
    } catch (parseErr) {
      this.logger.warn(`Failed to parse viral score JSON: ${(parseErr as Error).message}`);
      throw new Error(
        `AI returned invalid JSON for viral score. Raw response length: ${result.content.length}. Please try again.`,
      );
    }
  }
}
