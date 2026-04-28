import { Module } from '@nestjs/common';
import { ActionEngineModule } from '../action-engine/action-engine.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ContentGenerationModule } from '../content-generation/content-generation.module';
import { ContentMemoryModule } from '../content-memory/content-memory.module';
import { SettingsModule } from '../settings/settings.module';
import { TrendingSourceModule } from '../trending-source/trending-source.module';
import { CollectTweetsWorkflow } from './collect-tweets.workflow';

@Module({
  imports: [
    ActionEngineModule,
    AnalyticsModule,
    ContentGenerationModule,
    ContentMemoryModule,
    SettingsModule,
    TrendingSourceModule,
  ],
  providers: [CollectTweetsWorkflow],
  exports: [CollectTweetsWorkflow],
})
export class WorkflowsModule {}
