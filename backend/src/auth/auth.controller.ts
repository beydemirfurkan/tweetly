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
import type { Request } from 'express';
import { ApiKeyGuard, getAuthContext } from './api-key.guard';
import { ApiKeyService } from './api-key.service';
import { MagicLinkService } from './magic-link.service';
import { UsersService } from './users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly magicLinks: MagicLinkService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  @Post('request-link')
  async requestLink(@Body() body: { email?: string }) {
    const email = body.email?.trim();
    if (!email || !isValidEmail(email)) {
      throw new BadRequestException('valid email is required');
    }
    const user = await this.users.findOrCreate(email);
    await this.magicLinks.issue(user.id, user.email);
    return { ok: true };
  }

  @Post('consume')
  async consume(@Body() body: { token?: string }) {
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
  @UseGuards(ApiKeyGuard)
  async me(@Req() req: Request) {
    const ctx = getAuthContext(req);
    const user = await this.users.findById(ctx.userId);
    if (!user) throw new UnauthorizedException();
    return { id: user.id, email: user.email, status: user.status };
  }

  @Get('api-keys')
  @UseGuards(ApiKeyGuard)
  async listApiKeys(@Req() req: Request) {
    const ctx = getAuthContext(req);
    const keys = await this.apiKeys.listForUser(ctx.userId);
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.keyPrefix,
      scopes: k.scopes ?? [],
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
      revokedAt: k.revokedAt,
    }));
  }

  @Post('api-keys')
  @UseGuards(ApiKeyGuard)
  async createApiKey(
    @Req() req: Request,
    @Body() body: { name?: string; scopes?: string[] },
  ) {
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
  @UseGuards(ApiKeyGuard)
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
