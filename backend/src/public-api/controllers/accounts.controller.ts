import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiKeyGuard, getAuthContext } from '@/auth/api-key.guard';
import { RequiresScope } from '@/auth/requires-scope.decorator';
import {
  RateLimitConnect,
  RateLimitDelete,
  RateLimitRead,
  RateLimitWrite,
  TieredThrottlerGuard,
} from '@/auth/tiered-throttler.guard';
import { AccountFacade } from '../facades/account.facade';
import { AccountsResponseDto, AccountUpsertDto } from '../dto/account.dto';

@ApiBearerAuth('apiKey')
@Controller('api/v1')
@UseGuards(ApiKeyGuard, TieredThrottlerGuard)
@RequiresScope('write')
export class AccountsController {
  constructor(private readonly accounts: AccountFacade) {}

  @Get('me/summary')
  @ApiTags('accounts')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({
    summary: 'Per-user dashboard summary',
    description:
      'Returns the caller\'s account counts, user-scoped queue depth across all action ' +
      'types, and the number of actions that succeeded in the last 24 hours.',
  })
  async getSummary(@Req() req: Request) {
    return this.accounts.getSummary(getAuthContext(req).userId);
  }

  @Get('accounts')
  @ApiTags('accounts')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'List your connected X accounts' })
  @ApiResponse({ status: 200, type: AccountsResponseDto })
  async listAccounts(@Req() req: Request): Promise<AccountsResponseDto> {
    return this.accounts.listForUser(getAuthContext(req).userId);
  }

  @Post('accounts/cookie-validate')
  @HttpCode(HttpStatus.OK)
  @ApiTags('accounts')
  @RateLimitWrite()
  @ApiOperation({
    summary: 'Pre-flight cookie health-check before manual paste',
    description:
      'Probes X with the candidate auth_token + ct0 (and optional twid) cookies to verify the ' +
      'session is alive and resolves the screen_name. Use this before POST /accounts/:id ' +
      'so the panel can warn instead of saving stale credentials. Stateless — nothing is persisted.',
  })
  @ApiResponse({
    status: 200,
    description: 'Probe result. ok=true means cookies authenticate; ok=false includes a reason.',
  })
  async validateCookies(
    @Req() _req: Request,
    @Body() body: { authToken?: string; ct0?: string; twid?: string },
  ) {
    return this.accounts.validateCookies({
      authToken: body.authToken ?? '',
      ct0: body.ct0 ?? '',
      twid: body.twid ?? null,
    });
  }

  @Post('accounts/:id/refresh-profile')
  @HttpCode(HttpStatus.OK)
  @ApiTags('accounts')
  @RateLimitWrite()
  @ApiOperation({ summary: 'Refresh cached profile data for an account' })
  async refreshProfile(@Req() req: Request, @Param('id') id: string) {
    return this.accounts.refreshProfile(getAuthContext(req).userId, id);
  }

  @Delete('accounts/:id')
  @HttpCode(HttpStatus.OK)
  @ApiTags('accounts')
  @RateLimitDelete()
  @ApiOperation({
    summary: 'Disconnect an X account',
    description:
      'Deletes the account, its monitors (cascaded), and clears related session/content state. ' +
      'Pending and failed actions are cancelled; succeeded/dead rows are kept for audit.',
  })
  @ApiResponse({ status: 200, description: 'Account deleted' })
  @ApiResponse({ status: 404, description: 'Account not found or not yours' })
  async deleteAccount(@Req() req: Request, @Param('id') id: string) {
    return this.accounts.deleteAccount(getAuthContext(req).userId, id);
  }

  @Put('accounts/:id')
  @HttpCode(HttpStatus.OK)
  @ApiTags('accounts')
  @RateLimitConnect()
  @ApiOperation({
    summary: 'Connect or update an X account',
    description:
      'Token-paste connect: provide authToken/ct0/twid copied from a logged-in browser session. ' +
      'Empty fields preserve existing values on update. Rate-limited to 3 calls per 15 minutes ' +
      '(stricter than the default write tier to discourage credential brute force).',
  })
  @ApiResponse({ status: 200, description: 'Account upserted' })
  @ApiResponse({ status: 400, description: 'Validation error or account belongs to another user' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async upsertAccount(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AccountUpsertDto,
  ) {
    return this.accounts.upsertAccount(getAuthContext(req).userId, id, body);
  }
}
