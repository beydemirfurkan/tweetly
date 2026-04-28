import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { SettingsModule } from '../settings/settings.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { AdminApiController } from './admin-api.controller';
import { AdminApiService } from './admin-api.service';
import { AdminTokenGuard } from './admin-token.guard';

@Module({
  imports: [AnalyticsModule, SettingsModule, WorkflowsModule],
  controllers: [AdminApiController],
  providers: [AdminApiService, AdminTokenGuard],
})
export class AdminApiModule {}
