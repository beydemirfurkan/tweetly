import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ActionEngineModule } from '../action-engine/action-engine.module';
import { SettingsModule } from '../settings/settings.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { EngagementModule } from '../engagement/engagement.module';
import { AdminApiController } from './admin-api.controller';
import { AdminApiService } from './admin-api.service';
import { AdminTokenGuard } from './admin-token.guard';

@Module({
  imports: [AccountsModule, AnalyticsModule, SettingsModule, WorkflowsModule, ActionEngineModule, EngagementModule],
  controllers: [AdminApiController],
  providers: [AdminApiService, AdminTokenGuard],
  exports: [AdminApiService, AdminTokenGuard],
})
export class AdminApiModule {}
