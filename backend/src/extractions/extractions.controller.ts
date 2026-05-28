import { createReadStream } from 'fs';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiKeyGuard, getAuthContext } from '@/auth/api-key.guard';
import { RequiresScope } from '@/auth/requires-scope.decorator';
import {
  RateLimitRead,
  TieredThrottlerGuard,
} from '@/auth/tiered-throttler.guard';
import { AccountAccessService } from '@/accounts/application/account-access.service';
import type {
  ExtractionParams,
  ExtractionType,
} from '@persistence/entities/extraction-job.entity';
import { ExtractionService } from './extraction.service';

interface CreateExtractionBody {
  type: ExtractionType;
  params: ExtractionParams;
  max_rows?: number;
  account?: string;
}

@ApiBearerAuth('apiKey')
@Controller('api/v1/extractions')
@UseGuards(ApiKeyGuard, TieredThrottlerGuard)
@ApiTags('extractions')
@RequiresScope('read')
export class ExtractionsController {
  constructor(
    private readonly extractions: ExtractionService,
    private readonly accounts: AccountAccessService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimitRead()
  @ApiOperation({
    summary: 'Queue a bulk extraction job (async). Polls one of the cursor-paginated read endpoints under the hood and writes results as JSONL.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'params'],
      properties: {
        type: {
          type: 'string',
          enum: [
            'user_followers',
            'user_following',
            'user_tweets',
            'user_likes',
            'user_mentions',
            'tweet_retweeters',
            'search_tweets',
            'list_members',
          ],
        },
        params: {
          type: 'object',
          properties: {
            handle: { type: 'string' },
            tweetUrl: { type: 'string' },
            listId: { type: 'string' },
            query: { type: 'string' },
            verifiedOnly: { type: 'boolean' },
          },
        },
        max_rows: { type: 'integer', minimum: 1, maximum: 100000, default: 1000 },
        account: { type: 'string', nullable: true },
      },
    },
  })
  async create(@Req() req: Request, @Body() body: CreateExtractionBody) {
    const userId = getAuthContext(req).userId;
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('body is required');
    }
    const accountId = await this.accounts.resolveAccountIdOptional(userId, body.account);
    return this.extractions.validateAndEnqueue({
      userId,
      accountId: accountId ?? null,
      type: body.type,
      params: body.params ?? {},
      maxRows: body.max_rows ?? 1000,
    });
  }

  @Get(':id')
  @RateLimitRead()
  @ApiOperation({ summary: 'Get extraction job status + metadata' })
  async get(@Req() req: Request, @Param('id') id: string) {
    return this.extractions.findForUser(id, getAuthContext(req).userId);
  }

  @Get()
  @RateLimitRead()
  @ApiOperation({ summary: "List the caller's recent extraction jobs" })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(@Req() req: Request, @Query('limit') limit: string) {
    const lim = Math.min(parseInt(limit ?? '20', 10), 100);
    return this.extractions.listForUser(getAuthContext(req).userId, lim);
  }

  @Get(':id/download')
  @ApiOperation({
    summary: 'Stream the extraction result file (JSONL: one item per line)',
  })
  async download(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const job = await this.extractions.findForUser(id, getAuthContext(req).userId);
    const filePath = await this.extractions.readableFile(job);
    res.set({
      'Content-Type': 'application/x-ndjson',
      'Content-Disposition': `attachment; filename="extraction-${job.id}.jsonl"`,
    });
    return new StreamableFile(createReadStream(filePath));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a queued or running extraction job' })
  async cancel(@Req() req: Request, @Param('id') id: string): Promise<void> {
    const ok = await this.extractions.cancel(id, getAuthContext(req).userId);
    if (!ok) {
      throw new BadRequestException(`extraction ${id} not found or already terminal`);
    }
  }
}
