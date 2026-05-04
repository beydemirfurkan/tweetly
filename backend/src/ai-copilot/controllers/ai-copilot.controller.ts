import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiKeyGuard } from '@/auth/api-key.guard';
import { AdminUserGuard } from '../guards/admin-user.guard';
import { ProfileAnalyzerService } from '../services/profile-analyzer.service';
import { ContentSuggesterService } from '../services/content-suggester.service';
import { ViralScorerService } from '../services/viral-scorer.service';
import { AnalyzeProfileDto, ContentSuggestDto, ViralScoreDto, PublishTweetDto } from '../dto/ai-copilot.dto';
import { ActionEnqueueService } from '@/action-engine/action-enqueue.service';
import type { ProfileAnalysisResult } from '../types/style-profile.types';
import type { ContentSuggestResult } from '../types/content-format.types';
import type { ViralScoreResult } from '../types/viral-score.types';
import { TWEET_FORMATS } from '../types/content-format.types';

@Controller('copilot')
@UseGuards(ApiKeyGuard, AdminUserGuard)
export class AiCopilotController {
  constructor(
    private readonly profileAnalyzer: ProfileAnalyzerService,
    private readonly contentSuggester: ContentSuggesterService,
    private readonly viralScorer: ViralScorerService,
    private readonly enqueue: ActionEnqueueService,
  ) {}

  @Post('analyze-profile')
  async analyzeProfile(@Body() dto: AnalyzeProfileDto): Promise<ProfileAnalysisResult> {
    const handle = dto.handle?.replace('@', '').trim();
    if (!handle) throw new BadRequestException('handle is required');
    return this.profileAnalyzer.analyzeProfile(handle, dto.accountId);
  }

  @Post('suggest')
  async suggest(@Body() dto: ContentSuggestDto): Promise<ContentSuggestResult> {
    if (!dto.format) throw new BadRequestException('format is required');
    return this.contentSuggester.suggest({
      format: dto.format,
      topic: dto.topic,
      sourceHandles: dto.sourceHandles,
      styleProfile: dto.styleProfile,
    });
  }

  @Post('score')
  async score(@Body() dto: ViralScoreDto): Promise<ViralScoreResult> {
    if (!dto.text?.trim()) throw new BadRequestException('text is required');
    return this.viralScorer.score({
      text: dto.text,
      format: dto.format,
      handle: dto.handle,
    });
  }

  @Post('publish')
  async publish(@Body() dto: PublishTweetDto) {
    if (!dto.accountId) throw new BadRequestException('accountId is required');
    if (!dto.text?.trim()) throw new BadRequestException('text is required');
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : new Date();
    const result = await this.enqueue.enqueuePost({
      accountId: dto.accountId,
      text: dto.text,
      scheduledAt,
      metadata: { source: 'ai-copilot' },
    });
    return { queued: true, ...result };
  }

  @Get('formats')
  getFormats() {
    return TWEET_FORMATS;
  }
}
