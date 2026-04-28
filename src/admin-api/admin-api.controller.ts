import {
  Controller,
  Get,
  Post,
  Put,
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
import { AdminTokenGuard } from './admin-token.guard';
import { AdminApiService } from './admin-api.service';
import { SettingsService } from '../settings/settings.service';
import { WorkflowDispatchService } from '../workflows/workflow-dispatch.service';
import type { ActionType, ActionStatus } from '../domain/types/action.types';
import { ACTION_TYPES } from '../domain/types/action.types';

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminApiController {
  constructor(
    private readonly service: AdminApiService,
    private readonly settings: SettingsService,
    private readonly dispatch: WorkflowDispatchService,
    private readonly dataSource: DataSource,
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
    const keys = [
      'tweets_per_day', 'dispatch_interval_min', 'min_repo_score',
      'format.repo_drop.link_as_reply', 'format.adaptive.enabled',
      'digest.day', 'thread.days', 'schedule_jitter_min', 'schedule_jitter_max',
      'format.no_link_hook.weight', 'format.repo_drop.weight',
      'format.question.weight', 'format.comparison.weight',
      'format.bookmark_bait.weight', 'format.hot_take.weight',
      'format.mini_thread.weight', 'format.weekly_digest.weight',
    ];
    const entries = await Promise.all(
      keys.map(async (k) => [k, await this.settings.get(k, undefined, acctId)] as const),
    );
    return Object.fromEntries(entries);
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
}

function inferType(value: unknown): 'string' | 'number' | 'boolean' | 'json' {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'string';
}
