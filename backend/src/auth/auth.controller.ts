import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiKeyGuard, getAuthContext } from './api-key.guard';
import { ApiKeyService } from './api-key.service';
import { MagicLinkService } from './magic-link.service';
import {
  RateLimitDelete,
  RateLimitMagicLink,
  RateLimitRead,
  RateLimitWrite,
  TieredThrottlerGuard,
} from './tiered-throttler.guard';
import { UsersService } from './users.service';
import {
  ApiKeySummaryDto,
  ConsumeLinkDto,
  ConsumeResponseDto,
  CreateApiKeyDto,
  CreatedApiKeyDto,
  MeDto,
  RequestLinkDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
@UseGuards(TieredThrottlerGuard)
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly magicLinks: MagicLinkService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  @Post('request-link')
  @RateLimitMagicLink()
  @ApiOperation({
    summary: 'Send a magic-link to the given email',
    description:
      'Creates the user if missing, then issues a 15-minute magic link. ' +
      'In development, the link is logged to the server console. ' +
      'Rate-limited to 5 per minute per IP to prevent mail bombing.',
  })
  @ApiResponse({ status: 200, description: 'Link queued for delivery' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async requestLink(@Body() body: RequestLinkDto) {
    const email = body.email?.trim();
    if (!email || !isValidEmail(email)) {
      throw new BadRequestException('valid email is required');
    }
    const user = await this.users.findOrCreate(email);
    await this.magicLinks.issue(user.id, user.email);
    return { ok: true };
  }

  @Post('consume')
  @RateLimitWrite()
  @ApiOperation({
    summary: 'Exchange a magic-link token for a session API key',
    description:
      'Tokens are single-use and expire after 15 minutes. The returned sessionKey is a ' +
      'tk_*-prefixed API key with full scope; store it client-side as a Bearer token.',
  })
  @ApiResponse({ status: 200, description: 'Session key issued', type: ConsumeResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  async consume(@Body() body: ConsumeLinkDto): Promise<ConsumeResponseDto> {
    const token = body.token?.trim();
    if (!token) throw new BadRequestException('token is required');
    const userId = await this.magicLinks.consume(token);
    if (!userId) throw new UnauthorizedException('Invalid or expired token');

    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.emailVerifiedAt) {
      await this.users.markEmailVerified(user.id);
    }

    const created = await this.apiKeys.create({
      userId: user.id,
      name: 'Web session',
      scopes: ['*'],
    });
    return {
      ok: true,
      sessionKey: created.plainKey,
      user: { id: user.id, email: user.email },
    };
  }

  @Get('me')
  @UseGuards(ApiKeyGuard, TieredThrottlerGuard)
  @RateLimitRead()
  @ApiBearerAuth('apiKey')
  @ApiOperation({ summary: 'Return the user the bearer key belongs to' })
  @ApiResponse({ status: 200, type: MeDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  async me(@Req() req: Request): Promise<MeDto> {
    const ctx = getAuthContext(req);
    const user = await this.users.findById(ctx.userId);
    if (!user) throw new UnauthorizedException();
    return { id: user.id, email: user.email, status: user.status };
  }

  @Get('api-keys')
  @UseGuards(ApiKeyGuard, TieredThrottlerGuard)
  @RateLimitRead()
  @ApiBearerAuth('apiKey')
  @ApiOperation({ summary: 'List your API keys' })
  @ApiResponse({ status: 200, type: ApiKeySummaryDto, isArray: true })
  async listApiKeys(@Req() req: Request): Promise<ApiKeySummaryDto[]> {
    const ctx = getAuthContext(req);
    const keys = await this.apiKeys.listForUser(ctx.userId);
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.keyPrefix,
      scopes: k.scopes ?? [],
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
      expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
      createdAt: k.createdAt.toISOString(),
      revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
    }));
  }

  @Post('api-keys')
  @UseGuards(ApiKeyGuard, TieredThrottlerGuard)
  @RateLimitWrite()
  @ApiBearerAuth('apiKey')
  @ApiOperation({
    summary: 'Create a new API key',
    description: 'The plain key is returned once and never retrievable afterwards.',
  })
  @ApiResponse({ status: 201, type: CreatedApiKeyDto })
  async createApiKey(
    @Req() req: Request,
    @Body() body: CreateApiKeyDto,
  ): Promise<CreatedApiKeyDto> {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('name is required');
    const ctx = getAuthContext(req);
    const created = await this.apiKeys.create({
      userId: ctx.userId,
      name,
      scopes: body.scopes,
    });
    return {
      id: created.id,
      key: created.plainKey,
      prefix: created.prefix,
      name: created.name,
    };
  }

  @Delete('api-keys/:id')
  @UseGuards(ApiKeyGuard, TieredThrottlerGuard)
  @RateLimitDelete()
  @ApiBearerAuth('apiKey')
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiResponse({ status: 200, description: 'Key revoked' })
  @ApiResponse({ status: 400, description: 'Key not found or already revoked' })
  async revokeApiKey(@Req() req: Request, @Param('id') id: string) {
    const ctx = getAuthContext(req);
    const ok = await this.apiKeys.revoke(id, ctx.userId);
    if (!ok) throw new BadRequestException('API key not found or already revoked');
    return { ok: true };
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
