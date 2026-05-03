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
import { RequiresScope } from './requires-scope.decorator';
import {
  RateLimitDelete,
  RateLimitRead,
  RateLimitWrite,
  TieredThrottlerGuard,
} from './tiered-throttler.guard';
import { UsersService } from './users.service';
import {
  ApiKeySummaryDto,
  CreateApiKeyDto,
  CreatedApiKeyDto,
  MeDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
@UseGuards(TieredThrottlerGuard)
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  @Get('me')
  @UseGuards(ApiKeyGuard, TieredThrottlerGuard)
  @RequiresScope('*')
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
  @RequiresScope('*')
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
  @RequiresScope('*')
  @RateLimitWrite()
  @ApiBearerAuth('apiKey')
  @ApiOperation({
    summary: 'Create a new API key',
    description:
      'The plain key is returned once and never retrievable afterwards. ' +
      'Pass `scopes` to restrict the key (e.g. ["read"] for read-only). ' +
      'Omit or pass ["*"] for full access.',
  })
  @ApiResponse({ status: 201, type: CreatedApiKeyDto })
  async createApiKey(
    @Req() req: Request,
    @Body() body: CreateApiKeyDto,
  ): Promise<CreatedApiKeyDto> {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('name is required');
    const ctx = getAuthContext(req);
    const scopes = sanitizeScopes(body.scopes);
    const created = await this.apiKeys.create({
      userId: ctx.userId,
      name,
      scopes,
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
  @RequiresScope('*')
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

const ALLOWED_SCOPES = new Set(['*', 'read', 'write']);

function sanitizeScopes(input: string[] | undefined): string[] {
  if (!input || input.length === 0) return ['*'];
  const filtered = input
    .map((s) => s.trim().toLowerCase())
    .filter((s) => ALLOWED_SCOPES.has(s));
  if (filtered.length === 0) {
    throw new BadRequestException(
      `scopes must be a non-empty subset of: ${[...ALLOWED_SCOPES].join(', ')}`,
    );
  }
  // Deduplicate while preserving order.
  return Array.from(new Set(filtered));
}
