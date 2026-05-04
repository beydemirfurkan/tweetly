import { Injectable, Logger } from '@nestjs/common';
import { OpenRouterService } from './openrouter.service';
import type {
  ContentSuggestRequest,
  ContentSuggestResult,
  ContentSuggestion,
  TweetFormat,
} from '../types/content-format.types';
import { TWEET_FORMATS } from '../types/content-format.types';
import type { StyleProfile } from '../types/style-profile.types';
import { randomUUID } from 'crypto';

@Injectable()
export class ContentSuggesterService {
  private readonly logger = new Logger(ContentSuggesterService.name);

  constructor(private readonly ai: OpenRouterService) {}

  async suggest(request: ContentSuggestRequest): Promise<ContentSuggestResult> {
    const { format, topic, sourceHandles, styleProfile } = request;
    const fmt = TWEET_FORMATS[format];

    this.logger.log(`Generating ${fmt.label} content, topic=${topic ?? 'auto'}`);

    const systemPrompt = `You are a viral X (Twitter) content strategist.
You generate tweet content in specific formats that align with the X algorithm.
You understand what drives engagement: screen time, hooks, emotional triggers, and algorithmic amplification.
Always respond with valid JSON only, no markdown fences.`;

    const userPrompt = buildSuggestPrompt(format, fmt, topic, sourceHandles, styleProfile);

    const result = await this.ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.85, maxTokens: 4096 },
    );

    const suggestions = parseSuggestions(result.content, format);

    return {
      suggestions,
      format,
      generatedAt: new Date().toISOString(),
    };
  }
}

function buildSuggestPrompt(
  format: TweetFormat,
  fmt: { label: string; maxLength: number; description: string },
  topic?: string,
  sourceHandles?: string[],
  styleProfile?: StyleProfile,
): string {
  let prompt = `Generate 3 tweet suggestions in "${fmt.label}" format (max ${fmt.maxLength} chars each).
Format description: ${fmt.description}`;

  if (topic) {
    prompt += `\nTopic/niche: ${topic}`;
  }

  if (sourceHandles && sourceHandles.length > 0) {
    prompt += `\nDraw inspiration from these accounts: ${sourceHandles.join(', ')}`;
  }

  if (styleProfile) {
    prompt += `\n\nMatch this writing style:
- Tone: ${styleProfile.tone.join(', ')}
- Content style: ${styleProfile.contentStyle}
- Average length: ${styleProfile.avgLength} chars
- Engagement style: ${styleProfile.engagementStyle}
- Topics: ${styleProfile.topTopics.join(', ')}`;
  }

  if (format === 'storm') {
    prompt += `\n\nFor thread format: separate each tweet with "---TWEET---". Include 3-5 tweets.`;
  }

  prompt += `

Respond with JSON array:
[
  {
    "text": "the tweet text",
    "reasoning": "why this will perform well",
    "estimatedScore": 7.5
  }
]

Rules:
- Write in Turkish unless topic suggests otherwise
- Use natural, human-like language — avoid AI-sounding phrases
- Strong opening hooks that stop the scroll
- ${format === 'storm' ? 'Each tweet should flow naturally to the next' : 'Stay within character limit'}
- Estimate a viral score 1-10 based on hook strength, emotion, and readability`;

  return prompt;
}

function parseSuggestions(raw: string, format: TweetFormat): ContentSuggestion[] {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as Array<{
      text: string;
      reasoning: string;
      estimatedScore: number;
    }>;

    return parsed.map((item) => ({
      id: randomUUID(),
      text: item.text,
      format,
      charCount: item.text.length,
      estimatedScore: item.estimatedScore ?? 5,
      reasoning: item.reasoning ?? '',
    }));
  } catch {
    throw new Error(
      `AI returned invalid JSON for content suggestions. Raw length: ${raw.length}. Please try again.`,
    );
  }
}
