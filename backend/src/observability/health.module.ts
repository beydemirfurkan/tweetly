import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { AdminApiModule } from '@/admin-api/admin-api.module';
import { ActionEngineModule } from '@/action-engine/action-engine.module';

@Module({
  imports: [AdminApiModule, ActionEngineModule],
  controllers: [HealthController, MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class HealthModule {}
