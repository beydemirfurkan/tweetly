import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
  RateLimitRead,
  TieredThrottlerGuard,
} from '@/auth/tiered-throttler.guard';
import { AccountFacade } from '../facades/account.facade';
import {
  AccountConnectDto,
  AccountReauthDto,
  LoginJobAcceptedDto,
  LoginJobResponseDto,
} from '../dto/account-login.dto';

@ApiBearerAuth('apiKey')
@Controller('api/v1')
@UseGuards(ApiKeyGuard, TieredThrottlerGuard)
@RequiresScope('write')
export class LoginController {
  constructor(private readonly accounts: AccountFacade) {}

  @Post('accounts/connect')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiTags('accounts')
  @RateLimitConnect()
  @ApiOperation({
    summary: 'Connect a new X account via server-side login',
    description:
      'Queues a headless login job. The browser logs in to x.com with the provided credentials, ' +
      'extracts the session cookies, and stores them as a new connected account. The response ' +
      'returns immediately with a job id; poll GET /accounts/login-jobs/:jobId every 2s. ' +
      'Typical end-to-end duration is 20–40s. Rate-limited to 3 calls per 15 minutes per user.',
  })
  @ApiResponse({ status: 202, type: LoginJobAcceptedDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async connectAccount(
    @Req() req: Request,
    @Body() body: AccountConnectDto,
  ): Promise<LoginJobAcceptedDto> {
    return this.accounts.createConnectJob(getAuthContext(req).userId, body);
  }

  @Get('accounts/login-jobs/:jobId')
  @ApiTags('accounts')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({
    summary: 'Poll a login job',
    description:
      'Returns the current state of a connect/reauth job you own. ' +
      'Encrypted credentials are never exposed.',
  })
  @ApiResponse({ status: 200, type: LoginJobResponseDto })
  @ApiResponse({ status: 404, description: 'Job not found or not yours' })
  async getLoginJob(
    @Req() req: Request,
    @Param('jobId') jobId: string,
  ): Promise<LoginJobResponseDto> {
    return this.accounts.getLoginJob(getAuthContext(req).userId, jobId);
  }

  @Delete('accounts/login-jobs/:jobId')
  @ApiTags('accounts')
  @ApiOperation({
    summary: 'Cancel a login job',
    description:
      'Flips a queued or running login job to status=cancelled. For a running ' +
      'job the worker observes the flip between steps and unwinds the ' +
      'Patchright session — typical latency 1–5s, never more than one step. ' +
      'Already-terminal jobs (success/failed/cancelled) return 409.',
  })
  @ApiResponse({
    status: 200,
    description: 'Cancellation accepted; priorStatus indicates whether the worker had picked it up.',
  })
  @ApiResponse({ status: 404, description: 'Job not found or not yours' })
  @ApiResponse({ status: 409, description: 'Job is already terminal' })
  async cancelLoginJob(
    @Req() req: Request,
    @Param('jobId') jobId: string,
  ): Promise<{ ok: true; status: 'cancelled'; priorStatus: 'queued' | 'running' }> {
    return this.accounts.cancelLoginJob(getAuthContext(req).userId, jobId);
  }

  @Post('accounts/:id/reauth')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiTags('accounts')
  @RateLimitConnect()
  @ApiOperation({
    summary: 'Re-authenticate an existing X account',
    description:
      'Use when a connected account becomes unhealthy (session expired, paused after auth ' +
      'failures). Provides fresh credentials for a server-side login that overwrites cookies ' +
      'on the existing account row. The handle of the logged-in session must match the ' +
      'target account; otherwise the job fails with invalid_credentials.',
  })
  @ApiResponse({ status: 202, type: LoginJobAcceptedDto })
  @ApiResponse({ status: 404, description: 'Account not found or not yours' })
  async reauthAccount(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AccountReauthDto,
  ): Promise<LoginJobAcceptedDto> {
    return this.accounts.createReauthJob(getAuthContext(req).userId, id, body);
  }
}
