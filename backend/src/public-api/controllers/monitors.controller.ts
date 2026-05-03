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
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiKeyGuard, getAuthContext } from '@/auth/api-key.guard';
import { RequiresScope } from '@/auth/requires-scope.decorator';
import {
  RateLimitDelete,
  RateLimitRead,
  TieredThrottlerGuard,
} from '@/auth/tiered-throttler.guard';
import { MonitorFacade } from '../facades/monitor.facade';
import { MonitorCreateDto } from '../dto/monitor.dto';

@ApiBearerAuth('apiKey')
@Controller('api/v1')
@UseGuards(ApiKeyGuard, TieredThrottlerGuard)
@RequiresScope('write')
export class MonitorsController {
  constructor(private readonly monitors: MonitorFacade) {}

  @Get('monitors')
  @ApiTags('monitors')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'List your monitors' })
  async listMonitors(@Req() req: Request) {
    return this.monitors.listForUser(getAuthContext(req).userId);
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
    return this.monitors.create(getAuthContext(req).userId, body);
  }

  @Get('monitors/:id')
  @ApiTags('monitors')
  @RequiresScope('read')
  @RateLimitRead()
  @ApiOperation({ summary: 'Get monitor + recent webhook deliveries' })
  async getMonitor(@Req() req: Request, @Param('id') id: string) {
    return this.monitors.getOwnedMonitor(getAuthContext(req).userId, id);
  }

  @Post('monitors/:id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  @ApiTags('monitors')
  @ApiOperation({
    summary: 'Rotate the webhook signing secret',
    description: 'Returns the new secret once; the old one immediately stops being valid.',
  })
  async rotateMonitorSecret(@Req() req: Request, @Param('id') id: string) {
    return this.monitors.rotateSecret(getAuthContext(req).userId, id);
  }

  @Delete('monitors/:id')
  @HttpCode(HttpStatus.OK)
  @ApiTags('monitors')
  @RateLimitDelete()
  @ApiOperation({ summary: 'Delete a monitor' })
  async deleteMonitor(@Req() req: Request, @Param('id') id: string) {
    return this.monitors.delete(getAuthContext(req).userId, id);
  }
}
