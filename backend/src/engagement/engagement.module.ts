import { Module } from '@nestjs/common';
import { PostActionHook } from './post-action-hook.service';
import { EngagementConfigService } from './engagement-config.service';
import { EngagementCounterService } from './engagement-counter.service';
import { TimelineScraper } from './timeline-scraper.service';
import { ContentScorer } from './content-scorer.service';
import { TimelineDiscoveryService } from './timeline-discovery.service';
import { TimelineDiscoveryScheduler } from './timeline-discovery-scheduler.service';
import { ActionEngineModule } from '../action-engine/action-engine.module';
import { ContentGenerationModule } from '../content-generation/content-generation.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [ActionEngineModule, ContentGenerationModule, AccountsModule],
  providers: [
    PostActionHook,
    EngagementConfigService,
    EngagementCounterService,
    TimelineScraper,
    ContentScorer,
    TimelineDiscoveryService,
    TimelineDiscoveryScheduler,
  ],
  exports: [PostActionHook, EngagementConfigService, EngagementCounterService, TimelineDiscoveryService, TimelineDiscoveryScheduler],
})
export class EngagementModule {}
