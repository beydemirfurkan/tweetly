import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { OpenRouterService } from './openrouter.service';
import { MediaService } from './media.service';

@Module({
  imports: [SettingsModule],
  providers: [OpenRouterService, MediaService],
  exports: [OpenRouterService, MediaService],
})
export class ContentGenerationModule {}
