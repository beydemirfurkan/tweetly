import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { AdminTokenGuard } from './admin-token.guard';
import { AdminApiService } from './admin-api.service';
import { SettingsService } from '../settings/settings.service';
import { WorkflowDispatchService } from '../workflows/workflow-dispatch.service';
import { ActionEnqueueService } from '../action-engine/action-enqueue.service';
import type { ActionType, ActionStatus } from '../domain/types/action.types';
import { ACTION_TYPES } from '../domain/types/action.types';
import { EngagementConfigService } from '../engagement/engagement-config.service';
import { EngagementCounterService } from '../engagement/engagement-counter.service';
import { TimelineDiscoveryScheduler } from '../engagement/timeline-discovery-scheduler.service';
import type { EngagementConfig } from '../engagement/engagement-config.service';
import type { AccountStatus } from '../domain/types/account.types';
import type { AccountEntity } from '../persistence/entities/account.entity';
import { MonitoringService } from '../monitoring/monitoring.service';

const ACCOUNT_STATUSES: AccountStatus[] = ['active', 'paused', 'banned'];

interface AccountUpdateBody {
  displayName?: string | null;
  authToken?: string;
  authMulti?: string | null;
  ct0?: string | null;
  twid?: string | null;
  status?: AccountStatus;
}

interface SecretUpdateBody {
  openrouterApiKey?: string;
  adminToken?: string;
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

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminApiController {
  constructor(
    private readonly service: AdminApiService,
    private readonly accounts: AccountsService,
    private readonly settings: SettingsService,
    private readonly dispatch: WorkflowDispatchService,
    private readonly enqueue: ActionEnqueueService,
    private readonly engagementConfig: EngagementConfigService,
    private readonly engagementCounter: EngagementCounterService,
    private readonly discoveryScheduler: TimelineDiscoveryScheduler,
    private readonly dataSource: DataSource,
    private readonly monitoring: MonitoringService,
  ) {}

  @Get('status')
  async getStatus() {
    const [depth, perf] = await Promise.all([
      this.service.getQueueDepth(),
      this.service.getFormatPerformanceLast7d(),
    ]);
    const totalDead = depth.reduce((s, d) => s + d.dead, 0);
    const totalPending = depth.reduce((s, d) => s + d.pending, 0);
    return {
      ok: totalDead === 0,
      now: new Date().toISOString(),
      queue: {
        byType: depth,
        totalPending,
        totalDead,
      },
      analytics: {
        last7dPosts: perf.reduce((s, f) => s + f.total, 0),
        formatPerformance: perf,
      },
    };
  }

  @Get('queue/depth')
  async getQueueDepth() {
    return this.service.getQueueDepth();
  }

  @Get('accounts')
  async listAccounts() {
    const accounts = await this.accounts.listAll();
    return { count: accounts.length, accounts: accounts.map(redactAccount) };
  }

  @Put('accounts/:id')
  @HttpCode(HttpStatus.OK)
  async upsertAccount(@Param('id') id: string, @Body() body: AccountUpdateBody) {
    const accountId = id.trim();
    if (!accountId) throw new BadRequestException('account id is required');
    if (body.status && !ACCOUNT_STATUSES.includes(body.status)) {
      throw new BadRequestException(`status must be one of: ${ACCOUNT_STATUSES.join(', ')}`);
    }

    try {
      const authToken = typeof body.authToken === 'string' ? body.authToken.trim() : undefined;
      const account = await this.accounts.upsertAccount({
        id: accountId,
        displayName: body.displayName,
        authToken: authToken || undefined,
        authMulti: body.authMulti,
        ct0: body.ct0,
        twid: body.twid,
        status: body.status,
      });
      return { ok: true, account: redactAccount(account) };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Account could not be saved';
      throw new BadRequestException(message);
    }
  }

  @Get('secrets')
  async getSecretsStatus() {
    const [openrouterApiKey, adminToken] = await Promise.all([
      this.settings.get<string>('secrets.openrouter_api_key', ''),
      this.settings.get<string>('secrets.admin_token', ''),
    ]);
    return {
      openrouterApiKeyConfigured: Boolean(openrouterApiKey),
      adminTokenConfigured: Boolean(adminToken),
    };
  }

  @Put('secrets')
  @HttpCode(HttpStatus.OK)
  async updateSecrets(@Body() body: SecretUpdateBody) {
    let updated = 0;
    if (typeof body.openrouterApiKey === 'string' && body.openrouterApiKey.trim()) {
      await this.settings.set('secrets.openrouter_api_key', body.openrouterApiKey.trim());
      updated += 1;
    }
    if (typeof body.adminToken === 'string' && body.adminToken.trim()) {
      await this.settings.set('secrets.admin_token', body.adminToken.trim());
      updated += 1;
    }
    if (updated === 0) throw new BadRequestException('No valid secrets provided');

    return { ok: true, updated };
  }

  @Get('actions')
  async listActions(
    @Query('type') type: string,
    @Query('status') status: string,
    @Query('account') accountId: string,
    @Query('limit') limitStr: string,
  ) {
    if (!type || !ACTION_TYPES.includes(type as ActionType)) {
      throw new BadRequestException(`type must be one of: ${ACTION_TYPES.join(', ')}`);
    }
    const limit = Math.min(Math.max(1, parseInt(limitStr ?? '50', 10)), 200);
    const rows = await this.service.listActions(
      type as ActionType,
      status as ActionStatus | undefined,
      accountId || undefined,
      limit,
    );
    return { type, count: rows.length, rows };
  }

  @Post('actions/:type/:id/replay')
  @HttpCode(HttpStatus.OK)
  async replayAction(@Param('type') type: string, @Param('id') id: string) {
    if (!ACTION_TYPES.includes(type as ActionType)) {
      throw new BadRequestException(`Unknown action type: ${type}`);
    }
    const ok = await this.service.replayAction(type as ActionType, id);
    if (!ok) throw new NotFoundException(`Action ${id} not found or not in a replayable state`);
    return { ok: true, id, status: 'pending' };
  }

  @Post('actions/:type/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelAction(@Param('type') type: string, @Param('id') id: string) {
    if (!ACTION_TYPES.includes(type as ActionType)) {
      throw new BadRequestException(`Unknown action type: ${type}`);
    }
    const ok = await this.service.cancelAction(type as ActionType, id);
    if (!ok) throw new NotFoundException(`Action ${id} not found or not cancellable`);
    return { ok: true, id, status: 'cancelled' };
  }

  @Get('settings')
  async getSettings(@Query('account') accountId: string) {
    const acctId = accountId || undefined;
    const defs = this.settings.getDefs();
    const entries = await Promise.all(
      defs.map(async (d) => [d.key, await this.settings.get(d.key, d.defaultValue, acctId)] as const),
    );
    return Object.fromEntries(entries);
  }

  @Get('settings/defs')
  async getSettingDefs() {
    return this.settings.getDefs().map((d) => ({
      key: d.key,
      type: d.type,
      defaultValue: d.defaultValue,
    }));
  }

  @Put('settings')
  @HttpCode(HttpStatus.OK)
  async updateSettings(@Body() body: Record<string, unknown>) {
    const accountId = (body._accountId as string) || undefined;
    const entries = Object.entries(body).filter(([k]) => k !== '_accountId');
    if (entries.length === 0) throw new BadRequestException('No settings provided');

    const repo = this.dataSource.getRepository('settings');
    const now = new Date();
    for (const [key, value] of entries) {
      const type = inferType(value);
      const raw = type === 'json' ? JSON.stringify(value) : String(value);
      await repo.upsert(
        { key, accountId: accountId ?? '', value: raw, type, updatedAt: now },
        ['key', 'accountId'],
      );
    }
    this.settings.invalidateCache();
    return { ok: true, updated: entries.length };
  }

  @Post('collect')
  @HttpCode(HttpStatus.OK)
  async triggerCollect(@Query('account') accountId: string) {
    if (accountId) {
      await this.dispatch.runForAccount(accountId);
    } else {
      await this.dispatch.runAll();
    }
    return { ok: true };
  }

  @Post('test/post')
  @HttpCode(HttpStatus.OK)
  async testPost(@Body() body: { text: string; account?: string }) {
    if (!body.text) throw new BadRequestException('text is required');
    const result = await this.enqueue.enqueuePost({
      accountId: body.account ?? '',
      text: body.text,
      scheduledAt: new Date(),
      metadata: { source: 'test-post-hook' },
    });
    return { ok: true, id: result.id };
  }

  @Post('test/like')
  @HttpCode(HttpStatus.OK)
  async testLike(@Body() body: { targetTweetUrl: string; account?: string }) {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const result = await this.enqueue.enqueueLike({
      accountId: body.account ?? '',
      targetTweetUrl: body.targetTweetUrl,
      scheduledAt: new Date(),
      metadata: { source: 'manual-test' },
    });
    return { ok: true, id: result.id };
  }

  @Post('test/retweet')
  @HttpCode(HttpStatus.OK)
  async testRetweet(@Body() body: { targetTweetUrl: string; account?: string }) {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const result = await this.enqueue.enqueueRetweet({
      accountId: body.account ?? '',
      targetTweetUrl: body.targetTweetUrl,
      scheduledAt: new Date(),
      metadata: { source: 'manual-test' },
    });
    return { ok: true, id: result.id };
  }

  @Post('test/bookmark')
  @HttpCode(HttpStatus.OK)
  async testBookmark(@Body() body: { targetTweetUrl: string; account?: string }) {
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const result = await this.enqueue.enqueueBookmark({
      accountId: body.account ?? '',
      targetTweetUrl: body.targetTweetUrl,
      scheduledAt: new Date(),
      metadata: { source: 'manual-test' },
    });
    return { ok: true, id: result.id };
  }

  @Post('test/reply')
  @HttpCode(HttpStatus.OK)
  async testReply(@Body() body: { text: string; parentTweetUrl: string; account?: string }) {
    if (!body.text) throw new BadRequestException('text is required');
    if (!body.parentTweetUrl?.includes('/status/')) {
      throw new BadRequestException('parentTweetUrl must contain /status/');
    }
    const result = await this.enqueue.enqueueReply({
      accountId: body.account ?? '',
      text: body.text,
      parentTweetUrl: body.parentTweetUrl,
      scheduledAt: new Date(),
      metadata: { source: 'manual-test' },
    });
    return { ok: true, id: result.id };
  }

  @Post('test/quote')
  @HttpCode(HttpStatus.OK)
  async testQuote(@Body() body: { text: string; targetTweetUrl: string; account?: string }) {
    if (!body.text) throw new BadRequestException('text is required');
    if (!body.targetTweetUrl?.includes('/status/')) {
      throw new BadRequestException('targetTweetUrl must contain /status/');
    }
    const result = await this.enqueue.enqueueQuote({
      accountId: body.account ?? '',
      text: body.text,
      targetTweetUrl: body.targetTweetUrl,
      scheduledAt: new Date(),
      metadata: { source: 'manual-test' },
    });
    return { ok: true, id: result.id };
  }

  @Get('engagement/config')
  async getEngagementConfig(@Query('account') accountId: string) {
    if (!accountId) throw new BadRequestException('account query param required');
    return this.engagementConfig.get(accountId);
  }

  @Put('engagement/config')
  async updateEngagementConfig(@Body() body: Partial<EngagementConfig> & { accountId: string }) {
    if (!body.accountId) throw new BadRequestException('accountId is required');
    const { accountId, ...patch } = body;
    return this.engagementConfig.upsert(accountId, patch);
  }

  @Get('engagement/counters')
  async getEngagementCounters(@Query('account') accountId: string) {
    if (!accountId) throw new BadRequestException('account query param required');
    const [counts, config] = await Promise.all([
      this.engagementCounter.getAllDailyCounts(accountId),
      this.engagementConfig.get(accountId),
    ]);
    return {
      date: new Date().toISOString().split('T')[0],
      counts,
      limits: {
        likes: config.maxLikesPerDay,
        retweets: config.maxRetweetsPerDay,
        quotes: config.maxQuotesPerDay,
        bookmarks: config.maxBookmarksPerDay,
      },
    };
  }

  @Post('engagement/discover')
  @HttpCode(HttpStatus.OK)
  async triggerDiscovery(@Body() body: { account: string }) {
    if (!body.account) throw new BadRequestException('account is required');
    const result = await this.discoveryScheduler.runForAccount(body.account);
    return { ok: true };
  }

  @Get('engagement/discovered')
  async getDiscoveredTweets(
    @Query('account') accountId: string,
    @Query('limit') limit: string,
  ) {
    if (!accountId) throw new BadRequestException('account query param required');
    const n = Math.min(parseInt(limit ?? '20', 10), 100);
    return this.dataSource.query(
      `SELECT tweet_url, author_handle, content_text, relevance_score, engagement_type, discovered_at
       FROM discovered_tweets WHERE account_id = $1 ORDER BY discovered_at DESC LIMIT $2`,
      [accountId, n],
    );
  }

  // ── Monitoring ────────────────────────────────────────────────────────────

  @Get('monitors')
  async listMonitors() {
    const monitors = await this.monitoring.listAll();
    return { count: monitors.length, monitors };
  }

  @Post('monitors')
  @HttpCode(HttpStatus.CREATED)
  async createMonitor(
    @Body() body: { targetHandle: string; webhookUrl: string; accountId?: string; eventTypes?: string[] },
  ) {
    if (!body.targetHandle) throw new BadRequestException('targetHandle is required');
    if (!body.webhookUrl) throw new BadRequestException('webhookUrl is required');
    if (!body.webhookUrl.startsWith('http')) throw new BadRequestException('webhookUrl must be a valid HTTP/HTTPS URL');

    const monitor = await this.monitoring.create({
      accountId: body.accountId ?? '',
      targetHandle: body.targetHandle,
      webhookUrl: body.webhookUrl,
      eventTypes: body.eventTypes ?? ['tweet.new'],
    });
    return { ok: true, monitor };
  }

  @Get('monitors/:id')
  async getMonitor(@Param('id') id: string) {
    const monitor = await this.monitoring.findById(id);
    if (!monitor) throw new NotFoundException(`Monitor ${id} not found`);
    const deliveries = await this.monitoring.listDeliveries(id, 20);
    return { monitor, recentDeliveries: deliveries };
  }

  @Delete('monitors/:id')
  @HttpCode(HttpStatus.OK)
  async deleteMonitor(@Param('id') id: string) {
    const ok = await this.monitoring.delete(id);
    if (!ok) throw new NotFoundException(`Monitor ${id} not found`);
    return { ok: true };
  }

  @Patch('monitors/:id/pause')
  @HttpCode(HttpStatus.OK)
  async pauseMonitor(@Param('id') id: string) {
    const ok = await this.monitoring.disable(id);
    if (!ok) throw new NotFoundException(`Monitor ${id} not found`);
    return { ok: true, status: 'paused' };
  }
}

function inferType(value: unknown): 'string' | 'number' | 'boolean' | 'json' {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'string';
}

function redactAccount(account: AccountEntity): RedactedAccount {
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
