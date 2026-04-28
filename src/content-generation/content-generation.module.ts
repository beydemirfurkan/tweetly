import { Module } from '@nestjs/common';
import { OpenRouterService } from './openrouter.service';
import { MediaService } from './media.service';

@Module({
  providers: [OpenRouterService, MediaService],
  exports: [OpenRouterService, MediaService],
})
export class ContentGenerationModule {}
