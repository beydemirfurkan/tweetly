import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentMemoryEntity } from '@persistence/entities/content-memory.entity';
import { ContentMemoryService } from './content-memory.service';
import { TextNormalizer } from './text-normalizer.service';
import { SimilarityScorer } from './similarity-scorer.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContentMemoryEntity])],
  providers: [ContentMemoryService, TextNormalizer, SimilarityScorer],
  exports: [ContentMemoryService, TextNormalizer, SimilarityScorer],
})
export class ContentMemoryModule {}
