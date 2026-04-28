import { Module } from '@nestjs/common';
import { PostActionHook } from './post-action-hook.service';
import { EngagementConfigService } from './engagement-config.service';
import { EngagementCounterService } from './engagement-counter.service';
import { ActionEngineModule } from '../action-engine/action-engine.module';

@Module({
  imports: [ActionEngineModule],
  providers: [PostActionHook, EngagementConfigService, EngagementCounterService],
  exports: [PostActionHook, EngagementConfigService, EngagementCounterService],
})
export class EngagementModule {}
