import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiKeyGuard } from '@/auth/api-key.guard';
import { AdminUserGuard } from '../guards/admin-user.guard';
import { ProfileAnalyzerService } from '../services/profile-analyzer.service';
import { ContentSuggesterService } from '../services/content-suggester.service';
import { ViralScorerService } from '../services/viral-scorer.service';
import { CopilotAnalysisService } from '../services/copilot-analysis.service';
import { AnalyzeProfileDto, ContentSuggestDto, ViralScoreDto, PublishTweetDto } from '../dto/ai-copilot.dto';
import { ActionEnqueueService } from '@/action-engine/action-enqueue.service';
import { ContentMemoryService } from '@/content-memory/content-memory.service';
import type { ProfileAnalysisResult } from '../types/style-profile.types';
import type { ContentSuggestResult } from '../types/content-format.types';
import type { ViralScoreResult } from '../types/viral-score.types';
import { TWEET_FORMATS } from '../types/content-format.types';
import { RateLimitCopilot } from '@/auth/tiered-throttler.guard';

@Controller('copilot')
@UseGuards(ApiKeyGuard, AdminUserGuard)
@RateLimitCopilot()
export class AiCopilotController {
  constructor(
    private readonly profileAnalyzer: ProfileAnalyzerService,
    private readonly contentSuggester: ContentSuggesterService,
    private readonly viralScorer: ViralScorerService,
    private readonly enqueue: ActionEnqueueService,
    private readonly analysisService: CopilotAnalysisService,
    private readonly contentMemory: ContentMemoryService,
  ) {}

  @Post('analyze-profile')
  async analyzeProfile(@Body() dto: AnalyzeProfileDto): Promise<ProfileAnalysisResult> {
    const handle = dto.handle?.replace('@', '').trim();
    if (!handle) throw new BadRequestException('handle is required');
    const result = await this.profileAnalyzer.analyzeProfile(handle, dto.accountId);
    return result;
  }

  @Post('suggest')
  async suggest(@Body() dto: ContentSuggestDto): Promise<ContentSuggestResult> {
    if (!dto.format) throw new BadRequestException('format is required');

    const result = await this.contentSuggester.suggest({
      format: dto.format,
      topic: dto.topic,
      sourceHandles: dto.sourceHandles,
      styleProfile: dto.styleProfile,
    });

    return result;
  }

  @Post('score')
  async score(@Body() dto: ViralScoreDto): Promise<ViralScoreResult> {
    if (!dto.text?.trim()) throw new BadRequestException('text is required');
    const result = await this.viralScorer.score({
      text: dto.text,
      format: dto.format,
      handle: dto.handle,
    });
    return result;
  }

  @Post('publish')
  async publish(@Body() dto: PublishTweetDto) {
    if (!dto.accountId) throw new BadRequestException('accountId is required');
    if (!dto.text?.trim()) throw new BadRequestException('text is required');

    const dedupReason = await this.contentMemory.similarityReason(dto.text, dto.accountId);
    if (dedupReason) {
      throw new BadRequestException(`Similar content already posted: ${dedupReason}`);
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : new Date();
    const result = await this.enqueue.enqueuePost({
      accountId: dto.accountId,
      text: dto.text,
      scheduledAt,
      metadata: { source: 'ai-copilot' },
    });

    await this.contentMemory.add('ai-copilot', dto.text, dto.accountId);

    return { queued: true, ...result };
  }

  @Get('formats')
  getFormats() {
    return TWEET_FORMATS;
  }

  @Get('history')
  async getHistory(@Query('type') type?: string, @Query('limit') limit?: string) {
    const lmt = Math.min(Math.max(parseInt(limit ?? '10', 10) || 10, 1), 50);
    return this.analysisService.getHistory(
      'admin',
      (type as 'profile' | 'content' | 'viral_score') ?? undefined,
      lmt,
    );
  }
}
