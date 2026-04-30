import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { ActionEngineModule } from '../action-engine/action-engine.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { EngagementModule } from '../engagement/engagement.module';
import { SettingsModule } from '../settings/settings.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { AdminApiModule } from '../admin-api/admin-api.module';
import { XAutomationModule } from '../x-automation/x-automation.module';
import { TrendingSourceModule } from '../trending-source/trending-source.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [
    AdminApiModule,
    AccountsModule,
    ActionEngineModule,
    AnalyticsModule,
    EngagementModule,
    SettingsModule,
    WorkflowsModule,
    XAutomationModule,
    TrendingSourceModule,
    MonitoringModule,
  ],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
