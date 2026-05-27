import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiKeyGuard, getAuthContext } from '@/auth/api-key.guard';
import { StyleProfileService } from '../services/style-profile.service';
import { AgentConfigService } from '../services/agent-config.service';
import { AgentDraftService } from '../services/agent-draft.service';
import { AgentSchedulerService } from '../services/agent-scheduler.service';
import {
  CreateAgentConfigDto,
  UpdateAgentConfigDto,
  UpdateStyleProfileDto,
  AnalyzeStyleDto,
  ApproveDraftDto,
  EditDraftDto,
  EditAndApproveDraftDto,
} from '../dto/agent.dto';
import type { AgentDraftStatus } from '@persistence/entities/agent-draft.entity';
import type { Request } from 'express';

@Controller('agent')
@UseGuards(ApiKeyGuard)
export class AgentController {
  constructor(
    private readonly styleProfile: StyleProfileService,
    private readonly configService: AgentConfigService,
    private readonly draftService: AgentDraftService,
    private readonly scheduler: AgentSchedulerService,
  ) {}

  @Get('configs')
  async listConfigs(@Req() req: Request) {
    const { userId } = getAuthContext(req);
    return this.configService.findByUserId(userId);
  }

  @Post('configs')
  async createConfig(@Req() req: Request, @Body() dto: CreateAgentConfigDto) {
    const { userId } = getAuthContext(req);
    return this.configService.create({
      userId,
      accountId: dto.accountId,
      dailyTweetTarget: dto.dailyTweetTarget,
      formatPreference: dto.formatPreference,
      topics: dto.topics,
      toneOverride: dto.toneOverride,
      scheduleIntervalMinutes: dto.scheduleIntervalMinutes,
    });
  }

  @Patch('configs/:id')
  async updateConfig(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateAgentConfigDto) {
    const { userId } = getAuthContext(req);
    return this.configService.update(id, userId, dto);
  }

  @Delete('configs/:id')
  async deleteConfig(@Req() req: Request, @Param('id') id: string) {
    const { userId } = getAuthContext(req);
    const deleted = await this.configService.delete(id, userId);
    return { deleted };
  }

  @Get('style-profile/:accountId')
  async getStyleProfile(@Param('accountId') accountId: string) {
    return this.styleProfile.findByAccountId(accountId);
  }

  @Post('style-profile/:accountId')
  async updateStyleProfile(
    @Param('accountId') accountId: string,
    @Body() dto: UpdateStyleProfileDto,
  ) {
    return this.styleProfile.upsert(accountId, {
      customInstructions: dto.customInstructions,
      tweetLanguage: dto.tweetLanguage,
    });
  }

  @Post('style-profile/:accountId/analyze')
  async analyzeStyleProfile(
    @Param('accountId') accountId: string,
    @Body() dto: AnalyzeStyleDto,
  ) {
    if (!dto.handle?.trim()) throw new BadRequestException('handle is required');
    return this.styleProfile.analyzeAndSave(accountId, dto.handle.replace('@', '').trim());
  }

  @Get('drafts')
  async listDrafts(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const { userId } = getAuthContext(req);
    return this.draftService.list(userId, {
      status: status as AgentDraftStatus | undefined,
      accountId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('drafts/stats')
  async getDraftStats(@Req() req: Request) {
    const { userId } = getAuthContext(req);
    return this.draftService.getStats(userId);
  }

  @Post('drafts/:id/approve')
  async approveDraft(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ApproveDraftDto,
  ) {
    const { userId } = getAuthContext(req);
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;
    return this.draftService.approve(id, userId, scheduledAt);
  }

  @Post('drafts/:id/reject')
  async rejectDraft(@Req() req: Request, @Param('id') id: string) {
    const { userId } = getAuthContext(req);
    return this.draftService.reject(id, userId);
  }

  @Patch('drafts/:id')
  async editDraft(@Req() req: Request, @Param('id') id: string, @Body() dto: EditDraftDto) {
    const { userId } = getAuthContext(req);
    return this.draftService.edit(id, userId, dto.text);
  }

  @Post('drafts/:id/edit-and-approve')
  async editAndApproveDraft(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: EditAndApproveDraftDto,
  ) {
    const { userId } = getAuthContext(req);
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;
    return this.draftService.editAndApprove(id, userId, dto.text, scheduledAt);
  }

  @Post('trigger/:configId')
  async triggerAgent(@Req() req: Request, @Param('configId') configId: string) {
    const { userId } = getAuthContext(req);
    return this.scheduler.triggerManually(configId, userId);
  }
}
