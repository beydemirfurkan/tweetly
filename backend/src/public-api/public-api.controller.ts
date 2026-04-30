import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import type { Request } from 'express';
import { ApiKeyGuard, getAuthContext } from '../auth/api-key.guard';
import { AccountsService } from '../accounts/accounts.service';
import { ActionEnqueueService } from '../action-engine/action-enqueue.service';
import { AdminApiService } from '../admin-api/admin-api.service';
import { XDirectService } from '../x-automation/x-direct.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import type { ActionType, ActionStatus } from '../domain/types/action.types';
import { ACTION_TYPES } from '../domain/types/action.types';
import type { AccountStatus } from '../domain/types/account.types';
import type { AccountEntity } from '../persistence/entities/account.entity';

const ACCOUNT_STATUSES: AccountStatus[] = ['active', 'paused', 'banned'];

interface AccountUpsertBody {
  displayName?: string | null;
  authToken?: string;
  authMulti?: string | null;
  ct0?: string | null;
  twid?: string | null;
  status?: AccountStatus;
}

interface PostBody { text: string; account?: string }
interface ReplyBody { text: string; parentTweetUrl: string; account?: string }
interface QuoteBody { text: string; targetTweetUrl: string; account?: string }
interface InteractionBody { targetTweetUrl: string; account?: string }
interface FollowBody { targetHandle: string; account?: string }
interface ThreadBody { tweets: string[]; account?: string }

interface MonitorCreateBody {
  targetHandle: string;
  webhookUrl: string;
  accountId?: string;
  eventTypes?: string[];
}

@Controller('api/v1')
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly enqueue: ActionEnqueueService,
    private readonly admin: AdminApiService,
    private readonly xDirect: XDirectService,
    private readonly monitoring: MonitoringService,
  ) {}

  // ── Accounts ──────────────────────────────────────────────────────────────

  @Get('accounts')
  async listAccounts(@Req() req: Request) {
    const ctx = getAuthContext(req);
    const accounts = await this.accounts.listAllForUser(ctx.userId);
    return { count: accounts.length, accounts: accounts.map(redact) };
  }

  @Put('accounts/:id')
  @HttpCode(HttpStatus.OK)
  async upsertAccount(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AccountUpsertBody,
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
      return { ok: true, account: redact(account) };
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Account could not be saved');
    }
  }

  // ── Action enqueue ────────────────────────────────────────────────────────

  @Post('actions/post')
  @HttpCode(HttpStatus.OK)
  async enqueuePost(@Req() req: Request, @Body() body: PostBody) {
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
  async enqueueReply(@Req() req: Request, @Body() body: ReplyBody) {
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
  async enqueueQuote(@Req() req: Request, @Body() body: QuoteBody) {
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
  async getUser(
    @Req() req: Request,
    @Param('handle') handle: string,
    @Query('account') accountId: string,
  ) {
    const acct = await this.resolveAccountIdOptional(req, accountId);
    return this.xDirect.getUser(handle, acct);
  }

  @Get('x/users/:handle/tweets')
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
  async getTweet(@Req() req: Request, @Body() body: { tweetUrl: string; account?: string }) {
    if (!body.tweetUrl?.includes('/status/')) {
      throw new BadRequestException('tweetUrl must contain /status/');
    }
    const acct = await this.resolveAccountIdOptional(req, body.account);
    return this.xDirect.getTweet(body.tweetUrl, acct);
  }

  @Get('x/trending')
  async getXTrending(@Req() req: Request, @Query('account') accountId: string) {
    const acct = await this.resolveAccountIdOptional(req, accountId);
    return this.xDirect.getXTrending(acct);
  }

  // ── Direct write/undo (Patchright synchronous) ────────────────────────────

  @Post('x/tweets/unlike')
  @HttpCode(HttpStatus.OK)
  async unlikeTweet(@Req() req: Request, @Body() body: InteractionBody) {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const acct = await this.resolveAccountId(req, body.account);
    return this.xDirect.unlikeTweet(body.targetTweetUrl, acct);
  }

  @Post('x/tweets/unretweet')
  @HttpCode(HttpStatus.OK)
  async unretweet(@Req() req: Request, @Body() body: InteractionBody) {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const acct = await this.resolveAccountId(req, body.account);
    return this.xDirect.unretweetTweet(body.targetTweetUrl, acct);
  }

  @Post('x/tweets/delete')
  @HttpCode(HttpStatus.OK)
  async deleteTweet(@Req() req: Request, @Body() body: InteractionBody) {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const acct = await this.resolveAccountId(req, body.account);
    return this.xDirect.deleteTweet(body.targetTweetUrl, acct);
  }

  @Post('x/follows/unfollow')
  @HttpCode(HttpStatus.OK)
  async unfollow(@Req() req: Request, @Body() body: FollowBody) {
    if (!body.targetHandle) throw new BadRequestException('targetHandle is required');
    const acct = await this.resolveAccountId(req, body.account);
    return this.xDirect.unfollowAccount(body.targetHandle, acct);
  }

  @Post('x/dm/send')
  @HttpCode(HttpStatus.OK)
  async sendDm(
    @Req() req: Request,
    @Body() body: { targetHandle: string; message: string; account?: string },
  ) {
    if (!body.targetHandle) throw new BadRequestException('targetHandle is required');
    if (!body.message) throw new BadRequestException('message is required');
    const acct = await this.resolveAccountId(req, body.account);
    return this.xDirect.sendDm(body.targetHandle, body.message, acct);
  }

  @Put('x/profile')
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Req() req: Request,
    @Body() body: { name?: string; bio?: string; location?: string; website?: string; account?: string },
  ) {
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
  async listMonitors(@Req() req: Request) {
    const ctx = getAuthContext(req);
    const userAccounts = await this.accounts.listAllForUser(ctx.userId);
    const allowedIds = new Set(userAccounts.map((a) => a.id));
    const all = await this.monitoring.listAll();
    const filtered = all.filter((m) => allowedIds.has(m.accountId));
    return { count: filtered.length, monitors: filtered };
  }

  @Post('monitors')
  @HttpCode(HttpStatus.CREATED)
  async createMonitor(@Req() req: Request, @Body() body: MonitorCreateBody) {
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
    return { ok: true, monitor };
  }

  @Get('monitors/:id')
  async getMonitor(@Req() req: Request, @Param('id') id: string) {
    const monitor = await this.monitoring.findById(id);
    if (!monitor) throw new NotFoundException(`Monitor ${id} not found`);
    await this.assertAccountOwnership(req, monitor.accountId);
    const deliveries = await this.monitoring.listDeliveries(id, 20);
    return { monitor, recentDeliveries: deliveries };
  }

  @Delete('monitors/:id')
  @HttpCode(HttpStatus.OK)
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

interface RedactedAccount {
  id: string;
  displayName: string | null;
  status: AccountStatus;
  hasAuthToken: boolean;
  hasAuthMulti: boolean;
  hasCt0: boolean;
  hasTwid: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}

function redact(account: AccountEntity): RedactedAccount {
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
  };
}
