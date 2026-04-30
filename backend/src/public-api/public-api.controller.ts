import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
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
import { ApiKeyGuard, getAuthContext } from '../auth/api-key.guard';
import { RequiresScope } from '../auth/requires-scope.decorator';
import {
  RateLimitConnect,
  RateLimitDelete,
  RateLimitFollow,
  RateLimitRead,
  RateLimitWrite,
  TieredThrottlerGuard,
} from '../auth/tiered-throttler.guard';
import { AccountsService } from '../accounts/accounts.service';
import { ActionEnqueueService } from '../action-engine/action-enqueue.service';
import { AdminApiService } from '../admin-api/admin-api.service';
import { XDirectService } from '../x-automation/x-direct.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { CredentialCipherService } from '../common/crypto/credential-cipher.service';
import { LoginJobsRepository } from '../x-automation/login/login-jobs.repository';
import {
  LoginValidationError,
  assertBase32Secret,
  normalizeUsername,
  requireString,
} from '../x-automation/login/login-validation';
import type { ActionType, ActionStatus } from '../domain/types/action.types';
import { ACTION_TYPES } from '../domain/types/action.types';
import type { AccountStatus } from '../domain/types/account.types';
import type { AccountEntity } from '../persistence/entities/account.entity';
import {
  AccountUpsertDto,
  AccountsResponseDto,
  RedactedAccountDto,
  SessionHealthDto,
} from './dto/account.dto';
import {
  AccountConnectDto,
  AccountReauthDto,
  LoginJobAcceptedDto,
  LoginJobResponseDto,
} from './dto/account-login.dto';
import {
  ActionEnqueueResponseDto,
  FollowBody,
  GetTweetBody,
  InteractionBody,
  PostActionBody,
  QuoteActionBody,
  ReplyActionBody,
  SendDmBody,
  ThreadBody,
  UpdateProfileBody,
} from './dto/action.dto';
import { MonitorCreateDto } from './dto/monitor.dto';

const ACCOUNT_STATUSES: AccountStatus[] = ['active', 'paused', 'banned'];

@ApiBearerAuth('apiKey')
@Controller('api/v1')
@UseGuards(ApiKeyGuard, TieredThrottlerGuard)
@RequiresScope('write')
export class PublicApiController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly enqueue: ActionEnqueueService,
    private readonly admin: AdminApiService,
    private readonly xDirect: XDirectService,
    private readonly monitoring: MonitoringService,
    private readonly cipher: CredentialCipherService,
    private readonly loginJobs: LoginJobsRepository,
  ) {}

  // ── Summary (per-user dashboard) ──────────────────────────────────────────

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
    const ctx = getAuthContext(req);
    const userAccounts = await this.accounts.listAllForUser(ctx.userId);
    const accountIds = userAccounts.map((a) => a.id);
    const [queue, succeeded24h] = await Promise.all([
      this.admin.getQueueDepthForAccounts(accountIds),
      this.admin.getRecentSucceededCount(accountIds, 24 * 60 * 60 * 1000),
    ]);
    const totalPending = queue.reduce((s, q) => s + q.pending, 0);
    const totalDead = queue.reduce((s, q) => s + q.dead, 0);
    return {
      accounts: {
        total: userAccounts.length,
        active: userAccounts.filter((a) => a.status === 'active').length,
        paused: userAccounts.filter((a) => a.status === 'paused').length,
        banned: userAccounts.filter((a) => a.status === 'banned').length,
      },
      queue: { byType: queue, totalPending, totalDead },
      activity: { succeededLast24h: succeeded24h },
    };
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  @Get('accounts')
  @ApiTags('accounts')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'List your connected X accounts' })
  @ApiResponse({ status: 200, type: AccountsResponseDto })
  async listAccounts(@Req() req: Request): Promise<AccountsResponseDto> {
    const ctx = getAuthContext(req);
    const accounts = await this.accounts.listAllForUser(ctx.userId);
    const health = await this.accounts.getSessionHealthForAccounts(accounts.map((a) => a.id));
    return {
      count: accounts.length,
      accounts: accounts.map((a) => redact(a, health.get(a.id) ?? defaultHealth())),
    };
  }

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
    const ctx = getAuthContext(req);
    let username: string, email: string | null, password: string;
    let totpSecretRaw: string | null;
    try {
      username = normalizeUsername(body.username);
      email = optionalTrimmedString(body.email);
      password = requireString(body.password, 'password');
      totpSecretRaw = body.totpSecret?.trim() || null;
      if (totpSecretRaw) assertBase32Secret(totpSecretRaw, 'totpSecret');
    } catch (e) {
      if (e instanceof LoginValidationError) throw new BadRequestException(e.message);
      throw e;
    }

    await this.assertLoginCooldownIsClear(ctx.userId, username);

    const { id } = await this.loginJobs.create({
      userId: ctx.userId,
      kind: 'connect',
      targetAccountId: null,
      username,
      email,
      encryptedPassword: this.cipher.encrypt(password),
      encryptedTotpSecret: totpSecretRaw ? this.cipher.encrypt(totpSecretRaw) : null,
      saveTotpSecret: Boolean(body.saveTotpSecret),
      proxyCountry: null,
    });
    return { jobId: id, kind: 'connect', pollUrl: `/api/v1/accounts/login-jobs/${id}` };
  }

  @Get('accounts/login-jobs/:jobId')
  @ApiTags('accounts')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({
    summary: 'Poll a login job',
    description: 'Returns the current state of a connect/reauth job you own. ' +
      'Encrypted credentials are never exposed.',
  })
  @ApiResponse({ status: 200, type: LoginJobResponseDto })
  @ApiResponse({ status: 404, description: 'Job not found or not yours' })
  async getLoginJob(
    @Req() req: Request,
    @Param('jobId') jobId: string,
  ): Promise<LoginJobResponseDto> {
    const ctx = getAuthContext(req);
    const job = await this.loginJobs.findByIdForUser(jobId, ctx.userId);
    if (!job) throw new NotFoundException(`Login job ${jobId} not found`);
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      targetAccountId: job.targetAccountId,
      failureReason: job.failureReason,
      failureDetail: job.failureDetail,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    };
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
    const ctx = getAuthContext(req);
    const accountId = id.trim().toLowerCase();
    const account = await this.accounts.findByIdForUser(accountId, ctx.userId);
    if (!account) throw new NotFoundException(`Account ${id} not found`);

    let password: string, totpSecretRaw: string | null;
    try {
      password = requireString(body.password, 'password');
      totpSecretRaw = body.totpSecret?.trim() || null;
      if (totpSecretRaw) assertBase32Secret(totpSecretRaw, 'totpSecret');
    } catch (e) {
      if (e instanceof LoginValidationError) throw new BadRequestException(e.message);
      throw e;
    }
    // Reuse stored TOTP secret when caller didn't pass one.
    const encryptedTotp = totpSecretRaw
      ? this.cipher.encrypt(totpSecretRaw)
      : account.totpSecretEncrypted;

    await this.assertLoginCooldownIsClear(ctx.userId, account.id);

    const { id: jobId } = await this.loginJobs.create({
      userId: ctx.userId,
      kind: 'reauth',
      targetAccountId: account.id,
      username: account.id,
      email: body.email?.trim() || null,
      encryptedPassword: this.cipher.encrypt(password),
      encryptedTotpSecret: encryptedTotp,
      saveTotpSecret: Boolean(body.saveTotpSecret) || (totpSecretRaw === null && Boolean(account.totpSecretEncrypted)),
      proxyCountry: null,
    });
    return { jobId, kind: 'reauth', pollUrl: `/api/v1/accounts/login-jobs/${jobId}` };
  }

  private async assertLoginCooldownIsClear(userId: string, username: string): Promise<void> {
    const cooldown = await this.loginJobs.findActiveCooldown(userId, username);
    if (!cooldown) return;

    throw new HttpException({
      message: cooldown.manualReviewRequired
        ? 'Login temporarily blocked after repeated failures; manual review recommended.'
        : 'Login temporarily blocked after a recent failure.',
      retryAfterSec: cooldown.retryAfterSec,
      retryAt: cooldown.retryAt,
      failureCount: cooldown.failureCount,
      manualReviewRequired: cooldown.manualReviewRequired,
    }, HttpStatus.TOO_MANY_REQUESTS);
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
    const ctx = getAuthContext(req);
    const ok = await this.accounts.deleteAccount(id, ctx.userId);
    if (!ok) throw new NotFoundException(`Account ${id} not found`);
    return { ok: true };
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
    const ctx = getAuthContext(req);
    const accountId = id.trim();
    if (!accountId) throw new BadRequestException('account id is required');
    if (body.status && !ACCOUNT_STATUSES.includes(body.status)) {
      throw new BadRequestException(`status must be one of: ${ACCOUNT_STATUSES.join(', ')}`);
    }
    try {
      const account = await this.accounts.upsertAccount({
        id: accountId,
        userId: ctx.userId,
        displayName: body.displayName,
        authToken: typeof body.authToken === 'string' ? body.authToken.trim() || undefined : undefined,
        authMulti: body.authMulti,
        ct0: body.ct0,
        twid: body.twid,
        status: body.status,
      });
      return { ok: true, account: redact(account, defaultHealth()) };
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Account could not be saved');
    }
  }

  // ── Action enqueue ────────────────────────────────────────────────────────

  @Post('actions/post')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Enqueue a tweet' })
  @ApiResponse({ status: 200, type: ActionEnqueueResponseDto })
  async enqueuePost(@Req() req: Request, @Body() body: PostActionBody) {
    if (!body.text) throw new BadRequestException('text is required');
    const accountId = await this.resolveAccountId(req, body.account);
    return this.enqueue.enqueuePost({
      accountId,
      text: body.text,
      scheduledAt: new Date(),
      metadata: { source: 'rest' },
    });
  }

  @Post('actions/reply')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Enqueue a reply' })
  @ApiResponse({ status: 200, type: ActionEnqueueResponseDto })
  async enqueueReply(@Req() req: Request, @Body() body: ReplyActionBody) {
    if (!body.text) throw new BadRequestException('text is required');
    if (!body.parentTweetUrl?.includes('/status/')) {
      throw new BadRequestException('parentTweetUrl must contain /status/');
    }
    const accountId = await this.resolveAccountId(req, body.account);
    return this.enqueue.enqueueReply({
      accountId,
      text: body.text,
      parentTweetUrl: body.parentTweetUrl,
      scheduledAt: new Date(),
      metadata: { source: 'rest' },
    });
  }

  @Post('actions/like')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Enqueue a like' })
  @ApiResponse({ status: 200, type: ActionEnqueueResponseDto })
  async enqueueLike(@Req() req: Request, @Body() body: InteractionBody) {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const accountId = await this.resolveAccountId(req, body.account);
    return this.enqueue.enqueueLike({
      accountId,
      targetTweetUrl: body.targetTweetUrl,
      scheduledAt: new Date(),
      metadata: { source: 'rest' },
    });
  }

  @Post('actions/retweet')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Enqueue a retweet' })
  @ApiResponse({ status: 200, type: ActionEnqueueResponseDto })
  async enqueueRetweet(@Req() req: Request, @Body() body: InteractionBody) {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const accountId = await this.resolveAccountId(req, body.account);
    return this.enqueue.enqueueRetweet({
      accountId,
      targetTweetUrl: body.targetTweetUrl,
      scheduledAt: new Date(),
      metadata: { source: 'rest' },
    });
  }

  @Post('actions/quote')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Enqueue a quote tweet' })
  @ApiResponse({ status: 200, type: ActionEnqueueResponseDto })
  async enqueueQuote(@Req() req: Request, @Body() body: QuoteActionBody) {
    if (!body.text) throw new BadRequestException('text is required');
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const accountId = await this.resolveAccountId(req, body.account);
    return this.enqueue.enqueueQuote({
      accountId,
      text: body.text,
      targetTweetUrl: body.targetTweetUrl,
      scheduledAt: new Date(),
      metadata: { source: 'rest' },
    });
  }

  @Post('actions/bookmark')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Enqueue a bookmark' })
  @ApiResponse({ status: 200, type: ActionEnqueueResponseDto })
  async enqueueBookmark(@Req() req: Request, @Body() body: InteractionBody) {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const accountId = await this.resolveAccountId(req, body.account);
    return this.enqueue.enqueueBookmark({
      accountId,
      targetTweetUrl: body.targetTweetUrl,
      scheduledAt: new Date(),
      metadata: { source: 'rest' },
    });
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
    if (!body.targetHandle) throw new BadRequestException('targetHandle is required');
    const accountId = await this.resolveAccountId(req, body.account);
    return this.enqueue.enqueueFollow({
      accountId,
      targetHandle: body.targetHandle,
      scheduledAt: new Date(),
      metadata: { source: 'rest' },
    });
  }

  @Post('actions/thread')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Enqueue a multi-tweet thread' })
  async enqueueThread(@Req() req: Request, @Body() body: ThreadBody) {
    if (!Array.isArray(body.tweets) || body.tweets.length === 0) {
      throw new BadRequestException('tweets must be a non-empty array');
    }
    const accountId = await this.resolveAccountId(req, body.account);
    const now = new Date();
    const results: Array<{ index: number; id: string | null }> = [];
    for (let i = 0; i < body.tweets.length; i++) {
      const r = await this.enqueue.enqueuePost({
        accountId,
        text: body.tweets[i],
        scheduledAt: new Date(now.getTime() + i * 5000),
        metadata: { source: 'rest-thread', threadIndex: i, threadLength: body.tweets.length },
      });
      results.push({ index: i, id: r.id });
    }
    return { enqueued: results.length, actions: results };
  }

  // ── Action management ────────────────────────────────────────────────────

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
    @Query('limit') limitStr: string,
  ) {
    const ctx = getAuthContext(req);
    if (!type || !ACTION_TYPES.includes(type as ActionType)) {
      throw new BadRequestException(`type must be one of: ${ACTION_TYPES.join(', ')}`);
    }
    const userAccounts = await this.accounts.listAllForUser(ctx.userId);
    if (userAccounts.length === 0) return { type, count: 0, rows: [] };

    const allowedIds = new Set(userAccounts.map((a) => a.id));
    if (accountId && !allowedIds.has(accountId)) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }
    const limit = Math.min(Math.max(1, parseInt(limitStr ?? '50', 10)), 200);

    const rows = await this.admin.listActions(
      type as ActionType,
      status as ActionStatus | undefined,
      accountId || undefined,
      limit,
    );
    const filtered = accountId
      ? rows
      : rows.filter((r) => allowedIds.has(r.account_id));
    return { type, count: filtered.length, rows: filtered };
  }

  @Post('actions/:type/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Cancel a pending action' })
  async cancelAction(@Req() req: Request, @Param('type') type: string, @Param('id') id: string) {
    if (!ACTION_TYPES.includes(type as ActionType)) {
      throw new BadRequestException(`Unknown action type: ${type}`);
    }
    await this.assertActionOwnership(req, type as ActionType, id);
    const ok = await this.admin.cancelAction(type as ActionType, id);
    if (!ok) throw new NotFoundException(`Action ${id} not found or not cancellable`);
    return { ok: true, id, status: 'cancelled' };
  }

  @Post('actions/:type/:id/replay')
  @HttpCode(HttpStatus.OK)
  @ApiTags('actions')
  @ApiOperation({ summary: 'Replay a failed or dead action' })
  async replayAction(@Req() req: Request, @Param('type') type: string, @Param('id') id: string) {
    if (!ACTION_TYPES.includes(type as ActionType)) {
      throw new BadRequestException(`Unknown action type: ${type}`);
    }
    await this.assertActionOwnership(req, type as ActionType, id);
    const ok = await this.admin.replayAction(type as ActionType, id);
    if (!ok) throw new NotFoundException(`Action ${id} not found or not replayable`);
    return { ok: true, id, status: 'pending' };
  }

  // ── X read operations (Patchright direct) ─────────────────────────────────

  @Get('x/search/tweets')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'Search tweets matching a query (live)' })
  @ApiQuery({ name: 'query', required: true })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'account', required: false })
  async searchTweets(
    @Req() req: Request,
    @Query('query') query: string,
    @Query('limit') limitStr: string,
    @Query('account') accountId: string,
  ) {
    if (!query) throw new BadRequestException('query is required');
    const limit = Math.min(parseInt(limitStr ?? '20', 10), 50);
    const acct = await this.resolveAccountIdOptional(req, accountId);
    return this.xDirect.searchTweets(query, limit, acct);
  }

  @Get('x/search/users')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'Search users by name or handle' })
  async searchUsers(
    @Req() req: Request,
    @Query('query') query: string,
    @Query('limit') limitStr: string,
    @Query('account') accountId: string,
  ) {
    if (!query) throw new BadRequestException('query is required');
    const limit = Math.min(parseInt(limitStr ?? '20', 10), 50);
    const acct = await this.resolveAccountIdOptional(req, accountId);
    return this.xDirect.searchUsers(query, limit, acct);
  }

  @Get('x/users/:handle')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'Get a user profile' })
  async getUser(
    @Req() req: Request,
    @Param('handle') handle: string,
    @Query('account') accountId: string,
  ) {
    const acct = await this.resolveAccountIdOptional(req, accountId);
    return this.xDirect.getUser(handle, acct);
  }

  @Get('x/users/:handle/tweets')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: "Get a user's recent tweets" })
  async getUserTweets(
    @Req() req: Request,
    @Param('handle') handle: string,
    @Query('limit') limitStr: string,
    @Query('account') accountId: string,
  ) {
    const limit = Math.min(parseInt(limitStr ?? '20', 10), 50);
    const acct = await this.resolveAccountIdOptional(req, accountId);
    return this.xDirect.getUserTweets(handle, limit, acct);
  }

  @Get('x/users/:handle/followers')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: "Get a user's followers" })
  async getUserFollowers(
    @Req() req: Request,
    @Param('handle') handle: string,
    @Query('limit') limitStr: string,
    @Query('account') accountId: string,
  ) {
    const limit = Math.min(parseInt(limitStr ?? '50', 10), 200);
    const acct = await this.resolveAccountIdOptional(req, accountId);
    return this.xDirect.getUserFollowers(handle, limit, acct);
  }

  @Post('x/tweets/get')
  @HttpCode(HttpStatus.OK)
  @ApiTags('x')
  @RequiresScope('read')
  @ApiOperation({ summary: 'Get tweet details by URL' })
  async getTweet(@Req() req: Request, @Body() body: GetTweetBody) {
    if (!body.tweetUrl?.includes('/status/')) {
      throw new BadRequestException('tweetUrl must contain /status/');
    }
    const acct = await this.resolveAccountIdOptional(req, body.account);
    return this.xDirect.getTweet(body.tweetUrl, acct);
  }

  @Get('x/trending')
  @ApiTags('x')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'Get current X trending topics' })
  async getXTrending(@Req() req: Request, @Query('account') accountId: string) {
    const acct = await this.resolveAccountIdOptional(req, accountId);
    return this.xDirect.getXTrending(acct);
  }

  // ── Direct write/undo (Patchright synchronous) ────────────────────────────

  @Post('x/tweets/unlike')
  @HttpCode(HttpStatus.OK)
  @ApiTags('x')
  @ApiOperation({ summary: 'Remove a like (synchronous)' })
  async unlikeTweet(@Req() req: Request, @Body() body: InteractionBody) {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const acct = await this.resolveAccountId(req, body.account);
    return this.xDirect.unlikeTweet(body.targetTweetUrl, acct);
  }

  @Post('x/tweets/unretweet')
  @HttpCode(HttpStatus.OK)
  @ApiTags('x')
  @ApiOperation({ summary: 'Undo a retweet (synchronous)' })
  async unretweet(@Req() req: Request, @Body() body: InteractionBody) {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const acct = await this.resolveAccountId(req, body.account);
    return this.xDirect.unretweetTweet(body.targetTweetUrl, acct);
  }

  @Post('x/tweets/delete')
  @HttpCode(HttpStatus.OK)
  @ApiTags('x')
  @ApiOperation({ summary: 'Delete a tweet (synchronous)' })
  async deleteTweet(@Req() req: Request, @Body() body: InteractionBody) {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const acct = await this.resolveAccountId(req, body.account);
    return this.xDirect.deleteTweet(body.targetTweetUrl, acct);
  }

  @Post('x/follows/unfollow')
  @HttpCode(HttpStatus.OK)
  @ApiTags('x')
  @ApiOperation({ summary: 'Unfollow an account (synchronous)' })
  async unfollow(@Req() req: Request, @Body() body: FollowBody) {
    if (!body.targetHandle) throw new BadRequestException('targetHandle is required');
    const acct = await this.resolveAccountId(req, body.account);
    return this.xDirect.unfollowAccount(body.targetHandle, acct);
  }

  @Post('x/dm/send')
  @HttpCode(HttpStatus.OK)
  @ApiTags('x')
  @ApiOperation({ summary: 'Send a direct message' })
  async sendDm(@Req() req: Request, @Body() body: SendDmBody) {
    if (!body.targetHandle) throw new BadRequestException('targetHandle is required');
    if (!body.message) throw new BadRequestException('message is required');
    const acct = await this.resolveAccountId(req, body.account);
    return this.xDirect.sendDm(body.targetHandle, body.message, acct);
  }

  @Put('x/profile')
  @HttpCode(HttpStatus.OK)
  @ApiTags('x')
  @ApiOperation({ summary: 'Update profile fields (name/bio/location/website)' })
  async updateProfile(@Req() req: Request, @Body() body: UpdateProfileBody) {
    const fields = {
      name: body.name,
      bio: body.bio,
      location: body.location,
      website: body.website,
    };
    if (!Object.values(fields).some(Boolean)) {
      throw new BadRequestException('at least one of name, bio, location, website is required');
    }
    const acct = await this.resolveAccountId(req, body.account);
    return this.xDirect.updateProfile(fields, acct);
  }

  // ── Monitors ──────────────────────────────────────────────────────────────

  @Get('monitors')
  @ApiTags('monitors')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'List your monitors' })
  async listMonitors(@Req() req: Request) {
    const ctx = getAuthContext(req);
    const userAccounts = await this.accounts.listAllForUser(ctx.userId);
    const allowedIds = new Set(userAccounts.map((a) => a.id));
    const all = await this.monitoring.listAll();
    const filtered = all.filter((m) => allowedIds.has(m.accountId)).map(redactMonitor);
    return { count: filtered.length, monitors: filtered };
  }

  @Post('monitors')
  @HttpCode(HttpStatus.CREATED)
  @ApiTags('monitors')
  @ApiOperation({
    summary: 'Create a monitor with webhook delivery',
    description:
      'Returns a `webhookSecret` on creation **once**. Use it to verify the ' +
      'X-Tweetly-Signature header on incoming webhook deliveries. The secret ' +
      'is never returned again — store it server-side. Use POST /monitors/:id/rotate-secret ' +
      'if you lose it or need to rotate.',
  })
  async createMonitor(@Req() req: Request, @Body() body: MonitorCreateDto) {
    if (!body.targetHandle) throw new BadRequestException('targetHandle is required');
    if (!body.webhookUrl?.startsWith('http')) {
      throw new BadRequestException('webhookUrl must be a valid HTTP/HTTPS URL');
    }
    const accountId = await this.resolveAccountId(req, body.accountId);
    const monitor = await this.monitoring.create({
      accountId,
      targetHandle: body.targetHandle,
      webhookUrl: body.webhookUrl,
      eventTypes: body.eventTypes ?? ['tweet.new'],
    });
    return {
      ok: true,
      monitor: redactMonitor(monitor),
      webhookSecret: monitor.webhookSecret,
    };
  }

  @Get('monitors/:id')
  @ApiTags('monitors')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'Get monitor + recent webhook deliveries' })
  async getMonitor(@Req() req: Request, @Param('id') id: string) {
    const monitor = await this.monitoring.findById(id);
    if (!monitor) throw new NotFoundException(`Monitor ${id} not found`);
    await this.assertAccountOwnership(req, monitor.accountId);
    const deliveries = await this.monitoring.listDeliveries(id, 20);
    return { monitor: redactMonitor(monitor), recentDeliveries: deliveries };
  }

  @Post('monitors/:id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  @ApiTags('monitors')
  @ApiOperation({
    summary: 'Rotate the webhook signing secret',
    description: 'Returns the new secret once; the old one immediately stops being valid.',
  })
  async rotateMonitorSecret(@Req() req: Request, @Param('id') id: string) {
    const monitor = await this.monitoring.findById(id);
    if (!monitor) throw new NotFoundException(`Monitor ${id} not found`);
    await this.assertAccountOwnership(req, monitor.accountId);
    const rotated = await this.monitoring.rotateSecret(id);
    if (!rotated) throw new NotFoundException(`Monitor ${id} not found`);
    return { ok: true, webhookSecret: rotated.webhookSecret };
  }

  @Delete('monitors/:id')
  @HttpCode(HttpStatus.OK)
  @ApiTags('monitors')
  @RateLimitDelete()
  @ApiOperation({ summary: 'Delete a monitor' })
  async deleteMonitor(@Req() req: Request, @Param('id') id: string) {
    const monitor = await this.monitoring.findById(id);
    if (!monitor) throw new NotFoundException(`Monitor ${id} not found`);
    await this.assertAccountOwnership(req, monitor.accountId);
    const ok = await this.monitoring.delete(id);
    if (!ok) throw new NotFoundException(`Monitor ${id} not found`);
    return { ok: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async resolveAccountId(req: Request, accountId?: string): Promise<string> {
    const ctx = getAuthContext(req);
    if (accountId) {
      const acct = await this.accounts.findByIdForUser(accountId, ctx.userId);
      if (!acct) throw new NotFoundException(`Account ${accountId} not found`);
      return acct.id;
    }
    const active = await this.accounts.listActiveForUser(ctx.userId);
    if (active.length === 0) {
      throw new BadRequestException('no active account; specify "account" or connect one');
    }
    return active[0].id;
  }

  private async resolveAccountIdOptional(req: Request, accountId?: string): Promise<string | undefined> {
    if (!accountId) {
      const ctx = getAuthContext(req);
      const active = await this.accounts.listActiveForUser(ctx.userId);
      return active[0]?.id;
    }
    return this.resolveAccountId(req, accountId);
  }

  private async assertAccountOwnership(req: Request, accountId: string): Promise<void> {
    const ctx = getAuthContext(req);
    const acct = await this.accounts.findByIdForUser(accountId, ctx.userId);
    if (!acct) throw new NotFoundException(`Account ${accountId} not found`);
  }

  private async assertActionOwnership(req: Request, type: ActionType, id: string): Promise<void> {
    const accountId = await this.admin.findActionAccountId(type, id);
    if (!accountId) throw new NotFoundException(`Action ${id} not found`);
    await this.assertAccountOwnership(req, accountId);
  }
}

function redact(account: AccountEntity, session: SessionHealthDto): RedactedAccountDto {
  return {
    id: account.id,
    displayName: account.displayName,
    status: account.status,
    hasAuthToken: Boolean(account.authToken),
    hasAuthMulti: Boolean(account.authMulti),
    hasCt0: Boolean(account.ct0),
    hasTwid: Boolean(account.twid),
    createdAt: account.createdAt,
    lastUsedAt: account.lastUsedAt,
    session,
  };
}

function defaultHealth(): SessionHealthDto {
  return {
    health: 'unknown',
    lastCheckAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    authFailureCount: 0,
  };
}

function optionalTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function redactMonitor<T extends { webhookSecret?: string | null }>(monitor: T) {
  // Strip the secret from list/get responses; it's only revealed on
  // create + rotate-secret.
  const { webhookSecret: _omit, ...rest } = monitor as T & { webhookSecret?: string | null };
  void _omit;
  return { ...rest, hasWebhookSecret: Boolean(monitor.webhookSecret) };
}
