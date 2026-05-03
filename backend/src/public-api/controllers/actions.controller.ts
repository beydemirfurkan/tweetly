import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiKeyGuard, getAuthContext } from '@/auth/api-key.guard';
import { RequiresScope } from '@/auth/requires-scope.decorator';
import {
  RateLimitFollow,
  RateLimitRead,
  TieredThrottlerGuard,
} from '@/auth/tiered-throttler.guard';
import { ACTION_TYPES } from '@domain/types/action.types';
import { ActionFacade } from '../facades/action.facade';
import {
  ActionEnqueueResponseDto,
  FollowBody,
  InteractionBody,
  PostActionBody,
  QuoteActionBody,
  ReplyActionBody,
  ThreadBody,
} from '../dto/action.dto';

@ApiBearerAuth('apiKey')
@Controller('api/v1')
@UseGuards(ApiKeyGuard, TieredThrottlerGuard)
@RequiresScope('write')
export class ActionsController {
  constructor(private readonly actions: ActionFacade) {}

  @Post('actions/post')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Enqueue a tweet' })
  @ApiResponse({ status: 200, type: ActionEnqueueResponseDto })
  async enqueuePost(@Req() req: Request, @Body() body: PostActionBody) {
    return this.actions.enqueuePost(getAuthContext(req).userId, body);
  }

  @Post('actions/reply')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Enqueue a reply' })
  @ApiResponse({ status: 200, type: ActionEnqueueResponseDto })
  async enqueueReply(@Req() req: Request, @Body() body: ReplyActionBody) {
    return this.actions.enqueueReply(getAuthContext(req).userId, body);
  }

  @Post('actions/like')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Enqueue a like' })
  @ApiResponse({ status: 200, type: ActionEnqueueResponseDto })
  async enqueueLike(@Req() req: Request, @Body() body: InteractionBody) {
    return this.actions.enqueueLike(getAuthContext(req).userId, body);
  }

  @Post('actions/retweet')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Enqueue a retweet' })
  @ApiResponse({ status: 200, type: ActionEnqueueResponseDto })
  async enqueueRetweet(@Req() req: Request, @Body() body: InteractionBody) {
    return this.actions.enqueueRetweet(getAuthContext(req).userId, body);
  }

  @Post('actions/quote')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Enqueue a quote tweet' })
  @ApiResponse({ status: 200, type: ActionEnqueueResponseDto })
  async enqueueQuote(@Req() req: Request, @Body() body: QuoteActionBody) {
    return this.actions.enqueueQuote(getAuthContext(req).userId, body);
  }

  @Post('actions/bookmark')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Enqueue a bookmark' })
  @ApiResponse({ status: 200, type: ActionEnqueueResponseDto })
  async enqueueBookmark(@Req() req: Request, @Body() body: InteractionBody) {
    return this.actions.enqueueBookmark(getAuthContext(req).userId, body);
  }

  @Post('actions/follow')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @RateLimitFollow()
  @ApiOperation({
    summary: 'Enqueue a follow',
    description: 'Rate-limited to 20 follows per minute and 400 per day per user.',
  })
  @ApiResponse({ status: 200, type: ActionEnqueueResponseDto })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async enqueueFollow(@Req() req: Request, @Body() body: FollowBody) {
    return this.actions.enqueueFollow(getAuthContext(req).userId, body);
  }

  @Post('actions/thread')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Enqueue a multi-tweet thread' })
  async enqueueThread(@Req() req: Request, @Body() body: ThreadBody) {
    return this.actions.enqueueThread(getAuthContext(req).userId, body);
  }

  @Get('actions')
  @ApiTags('actions')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'List your actions filtered by type/status/account' })
  @ApiQuery({ name: 'type', enum: ACTION_TYPES, required: true })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'account', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listActions(
    @Req() req: Request,
    @Query('type') type: string,
    @Query('status') status: string,
    @Query('account') accountId: string,
    @Query('limit') limit: string,
  ) {
    return this.actions.listForUser(getAuthContext(req).userId, type, status, accountId, limit);
  }

  @Post('actions/:type/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Cancel a pending action' })
  async cancelAction(
    @Req() req: Request,
    @Param('type') type: string,
    @Param('id') id: string,
  ) {
    return this.actions.cancel(getAuthContext(req).userId, type, id);
  }

  @Post('actions/:type/:id/replay')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Replay a failed or dead action' })
  async replayAction(
    @Req() req: Request,
    @Param('type') type: string,
    @Param('id') id: string,
  ) {
    return this.actions.replay(getAuthContext(req).userId, type, id);
  }
}
