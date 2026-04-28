import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { ActionEngineModule } from '../action-engine/action-engine.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ContentGenerationModule } from '../content-generation/content-generation.module';
import { ContentMemoryModule } from '../content-memory/content-memory.module';
import { SettingsModule } from '../settings/settings.module';
import { TrendingSourceModule } from '../trending-source/trending-source.module';
import { GithubTrendingWorkflow } from './collect-tweets.workflow';
import { WallpaperWorkflow } from './wallpaper.workflow';
import { WorkflowDispatchService } from './workflow-dispatch.service';

@Module({
  imports: [
    AccountsModule,
    ActionEngineModule,
    AnalyticsModule,
    ContentGenerationModule,
    ContentMemoryModule,
    SettingsModule,
    TrendingSourceModule,
  ],
  providers: [GithubTrendingWorkflow, WallpaperWorkflow, WorkflowDispatchService],
  exports: [GithubTrendingWorkflow, WallpaperWorkflow, WorkflowDispatchService],
})
export class WorkflowsModule {}
