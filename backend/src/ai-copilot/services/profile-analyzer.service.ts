import { Injectable, Logger } from '@nestjs/common';
import { OpenRouterService } from './openrouter.service';
import { XDirectReadService } from '@/x-automation/x-direct/x-direct-read.service';
import type { ProfileAnalysisResult, StyleProfile } from '../types/style-profile.types';

@Injectable()
export class ProfileAnalyzerService {
  private readonly logger = new Logger(ProfileAnalyzerService.name);

  constructor(
    private readonly ai: OpenRouterService,
    private readonly xRead: XDirectReadService,
  ) {}

  async analyzeProfile(handle: string, accountId?: string): Promise<ProfileAnalysisResult> {
    this.logger.log(`Analyzing profile: @${handle}`);

    const user = await this.xRead.getUser(handle, accountId);
    if (!user) throw new Error(`User @${handle} not found`);

    const tweetsResult = await this.xRead.getUserTweets(handle, 50, accountId);
    const tweets = tweetsResult.items;

    const tweetTexts = tweets.map((t) => t.text).join('\n---\n');

    const styleProfile = await this.extractStyleProfile(
      handle,
      user.bio,
      tweetTexts,
      tweets.length,
    );

    return {
      handle: user.handle,
      displayName: user.displayName,
      bio: user.bio,
      followersCount: parseInt(user.followersCount, 10) || 0,
      followingCount: parseInt(user.followingCount, 10) || 0,
      tweetsAnalyzed: tweets.length,
      styleProfile,
      analyzedAt: new Date().toISOString(),
    };
  }

  private async extractStyleProfile(
    handle: string,
    bio: string,
    tweetTexts: string,
    tweetCount: number,
  ): Promise<StyleProfile> {
    const result = await this.ai.chat(
      [
        {
          role: 'system',
          content: `You are an expert social media analyst specializing in X (Twitter) content strategy.
You analyze tweet histories and extract detailed writing style profiles.
Always respond with valid JSON only, no markdown fences.`,
        },
        {
          role: 'user',
          content: `Analyze the following X profile and recent tweets for @${handle}.

Bio: ${bio}

Recent tweets (${tweetCount} total):
${tweetTexts}

Extract a detailed style profile as JSON with this exact structure:
{
  "tone": ["word1", "word2"],
  "avgLength": 0,
  "hashtagUsage": 0.0,
  "emojiUsage": 0.0,
  "topTopics": ["topic1", "topic2"],
  "contentStyle": "short_punchy",
  "postingPattern": "description",
  "engagementStyle": "description",
  "summary": "2-3 sentence summary of this profile's voice"
}

Rules:
- tone: 3-5 descriptive adjectives (in English)
- avgLength: average character count per tweet
- hashtagUsage: 0.0 to 1.0 ratio of tweets containing hashtags
- emojiUsage: 0.0 to 1.0 ratio of tweets containing emojis
- topTopics: 3-5 main topics/themes
- contentStyle: one of "short_punchy", "storytelling", "educational", "conversational", "analytical", "inspirational"
- postingPattern: brief description of when/how they post
- engagementStyle: brief description of how they engage
- summary: natural language summary of their writing voice`,
        },
      ],
      { temperature: 0.3, maxTokens: 2048 },
    );

    try {
      const cleaned = result.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned) as StyleProfile;
    } catch (parseErr) {
      this.logger.warn(`Failed to parse style profile JSON for @${handle}: ${(parseErr as Error).message}`);
      throw new Error(
        `AI returned invalid JSON for style profile. Raw response length: ${result.content.length}. Please try again.`,
      );
    }
  }
}
