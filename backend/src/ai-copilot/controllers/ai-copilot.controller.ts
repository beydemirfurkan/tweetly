import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiKeyGuard, getAuthContext } from '@/auth/api-key.guard';
import { ProfileAnalyzerService } from '../services/profile-analyzer.service';
import { ContentSuggesterService } from '../services/content-suggester.service';
import { ViralScorerService } from '../services/viral-scorer.service';
import { CopilotAnalysisService } from '../services/copilot-analysis.service';
import { PublishOrchestratorService } from '../services/publish-orchestrator.service';
import { AnalyzeProfileDto, ContentSuggestDto, ViralScoreDto, PublishTweetDto } from '../dto/ai-copilot.dto';
import type { Request } from 'express';
import type { ProfileAnalysisResult } from '../types/style-profile.types';
import type { ContentSuggestResult } from '../types/content-format.types';
import type { ViralScoreResult } from '../types/viral-score.types';
import { TWEET_FORMATS } from '../types/content-format.types';
import { RateLimitCopilot } from '@/auth/tiered-throttler.guard';

@Controller('copilot')
@UseGuards(ApiKeyGuard)
@RateLimitCopilot()
export class AiCopilotController {
  constructor(
    private readonly profileAnalyzer: ProfileAnalyzerService,
    private readonly contentSuggester: ContentSuggesterService,
    private readonly viralScorer: ViralScorerService,
    private readonly analysisService: CopilotAnalysisService,
    private readonly publisher: PublishOrchestratorService,
  ) {}

  @Post('analyze-profile')
  async analyzeProfile(
    @Req() req: Request,
    @Body() dto: AnalyzeProfileDto,
  ): Promise<ProfileAnalysisResult> {
    const handle = dto.handle?.replace('@', '').trim();
    if (!handle) throw new BadRequestException('handle is required');

    const result = await this.profileAnalyzer.analyzeProfile(handle, dto.accountId);
    const userId = getAuthContext(req).userId;

    await this.analysisService.save({
      userId,
      type: 'profile',
      accountId: dto.accountId,
      inputData: { handle },
      resultData: result as unknown as Record<string, unknown>,
    });

    return result;
  }

  @Post('suggest')
  async suggest(
    @Req() req: Request,
    @Body() dto: ContentSuggestDto,
  ): Promise<ContentSuggestResult> {
    if (!dto.format) throw new BadRequestException('format is required');

    const result = await this.contentSuggester.suggest({
      format: dto.format,
      topic: dto.topic,
      sourceHandles: dto.sourceHandles,
      styleProfile: dto.styleProfile,
    });

    const userId = getAuthContext(req).userId;

    await this.analysisService.save({
      userId,
      type: 'content',
      inputData: { format: dto.format, topic: dto.topic, sourceHandles: dto.sourceHandles },
      resultData: result as unknown as Record<string, unknown>,
    });

    return result;
  }

  @Post('score')
  async score(
    @Req() req: Request,
    @Body() dto: ViralScoreDto,
  ): Promise<ViralScoreResult> {
    if (!dto.text?.trim()) throw new BadRequestException('text is required');

    const result = await this.viralScorer.score({
      text: dto.text,
      format: dto.format,
      handle: dto.handle,
    });

    const userId = getAuthContext(req).userId;

    await this.analysisService.save({
      userId,
      type: 'viral_score',
      inputData: { text: dto.text, format: dto.format, handle: dto.handle },
      resultData: result as unknown as Record<string, unknown>,
    });

    return result;
  }

  @Post('publish')
  async publish(@Body() dto: PublishTweetDto) {
    if (!dto.accountId) throw new BadRequestException('accountId is required');
    if (!dto.text?.trim()) throw new BadRequestException('text is required');

    return this.publisher.publish({
      accountId: dto.accountId,
      text: dto.text,
      scheduledAt: dto.scheduledAt,
    });
  }

  @Get('formats')
  getFormats() {
    return TWEET_FORMATS;
  }

  @Get('history')
  async getHistory(
    @Req() req: Request,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = getAuthContext(req).userId;
    const lmt = Math.min(Math.max(parseInt(limit ?? '10', 10) || 10, 1), 50);
    return this.analysisService.getHistory(
      userId,
      (type as 'profile' | 'content' | 'viral_score') ?? undefined,
      lmt,
    );
  }
}
