import { Injectable, Logger } from '@nestjs/common';
import { AgentConfigEntity } from '@persistence/entities/agent-config.entity';
import { StyleProfileService } from './style-profile.service';
import { AgentDraftService, CreateDraftInput } from './agent-draft.service';
import { ContentSuggesterService } from '@/ai-copilot/services/content-suggester.service';
import type { TweetFormat } from '@/ai-copilot/types/content-format.types';
import type { StyleProfile } from '@/ai-copilot/types/style-profile.types';

@Injectable()
export class AgentPipelineService {
  private readonly logger = new Logger(AgentPipelineService.name);

  constructor(
    private readonly styleProfile: StyleProfileService,
    private readonly draftService: AgentDraftService,
    private readonly contentSuggester: ContentSuggesterService,
  ) {}

  async generateDrafts(config: AgentConfigEntity, count: number = 3): Promise<CreateDraftInput[]> {
    this.logger.log(`Generating ${count} drafts for config ${config.id} (account: ${config.accountId})`);

    const style = await this.styleProfile.getEffectiveStyle(config.accountId);

    const styleProfile: StyleProfile | undefined = style.styleProfile
      ? (style.styleProfile as unknown as StyleProfile)
      : undefined;

    const topic = this.selectTopic(config);
    const format = this.selectFormat(config);

    const result = await this.contentSuggester.suggest({
      format,
      topic,
      styleProfile: this.enrichStyleProfile(styleProfile, style.customInstructions, config, style.tweetLanguage),
    });

    const drafts: CreateDraftInput[] = result.suggestions.map((suggestion) => ({
      agentConfigId: config.id,
      accountId: config.accountId,
      text: suggestion.text,
      format: suggestion.format,
      estimatedScore: suggestion.estimatedScore,
      reasoning: suggestion.reasoning,
      sourceTopic: topic,
    }));

    const saved = await this.draftService.createMany(drafts);
    this.logger.log(`Created ${saved.length} drafts for config ${config.id}`);

    return drafts;
  }

  private selectTopic(config: AgentConfigEntity): string | undefined {
    if (config.topics.length === 0) return undefined;
    const idx = Math.floor(Math.random() * config.topics.length);
    return config.topics[idx];
  }

  private selectFormat(config: AgentConfigEntity): TweetFormat {
    if (config.formatPreference.length === 0) return 'hook';
    const idx = Math.floor(Math.random() * config.formatPreference.length);
    return config.formatPreference[idx] as TweetFormat;
  }

  private enrichStyleProfile(
    base: StyleProfile | undefined,
    customInstructions: string,
    config: AgentConfigEntity,
    language: string,
  ): StyleProfile | undefined {
    if (!base && !customInstructions && !config.toneOverride) return undefined;

    const profile: StyleProfile = base ?? {
      tone: [],
      avgLength: 140,
      hashtagUsage: 0.1,
      emojiUsage: 0.1,
      topTopics: config.topics,
      contentStyle: 'conversational',
      postingPattern: 'regular',
      engagementStyle: 'informative',
      summary: '',
    };

    if (config.toneOverride) {
      profile.tone = [...profile.tone, config.toneOverride];
    }

    if (customInstructions) {
      profile.summary = `${profile.summary}\n\nCustom instructions: ${customInstructions}`;
    }

    if (language) {
      profile.summary = `${profile.summary}\n\nPreferred language: ${language}`;
    }

    return profile;
  }
}
