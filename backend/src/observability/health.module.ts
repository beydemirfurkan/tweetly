import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AdminApiModule } from '../admin-api/admin-api.module';

@Module({
  imports: [AnalyticsModule, AdminApiModule],
  controllers: [HealthController, MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class HealthModule {}
