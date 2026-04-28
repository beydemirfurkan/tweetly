import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../admin-api/admin-token.guard';
import { MetricsService } from './metrics.service';
import { AdminApiService } from '../admin-api/admin-api.service';
import type { ActionType } from '../domain/types/action.types';

@Controller()
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly adminService: AdminApiService,
  ) {}

  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  @UseGuards(AdminTokenGuard)
  async getMetrics(): Promise<string> {
    const depth = await this.adminService.getQueueDepth();
    for (const d of depth) {
      for (const [status, count] of Object.entries(d) as Array<[string, number]>) {
        if (status !== 'type') {
          this.metricsService.setQueueDepth(d.type as ActionType, status, count);
        }
      }
    }
    return this.metricsService.getMetrics();
  }
}
