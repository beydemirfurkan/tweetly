import { Module } from '@nestjs/common';
import { PostActionHook } from './post-action-hook.service';
import { ActionEngineModule } from '../action-engine/action-engine.module';

@Module({
  imports: [ActionEngineModule],
  providers: [PostActionHook],
  exports: [PostActionHook],
})
export class EngagementModule {}
