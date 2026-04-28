import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './observability/health.module';
import { PersistenceModule } from './persistence/persistence.module';
import { DomainModule } from './domain/domain.module';
import { ActionEngineModule } from './action-engine/action-engine.module';
import { AccountsModule } from './accounts/accounts.module';
import { XAutomationModule } from './x-automation/x-automation.module';
import { SettingsModule } from './settings/settings.module';
import { ContentMemoryModule } from './content-memory/content-memory.module';
import { TrendingSourceModule } from './trending-source/trending-source.module';
import { ContentGenerationModule } from './content-generation/content-generation.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { AdminApiModule } from './admin-api/admin-api.module';
import { EngagementModule } from './engagement/engagement.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PersistenceModule,
    DomainModule,
    AccountsModule,
    ActionEngineModule,
    XAutomationModule,
    SettingsModule,
    ContentMemoryModule,
    TrendingSourceModule,
    ContentGenerationModule,
    AnalyticsModule,
    WorkflowsModule,
    AdminApiModule,
    EngagementModule,
    HealthModule,
  ],
})
export class AppModule {}
