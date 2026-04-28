import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentMemoryEntity } from '../persistence/entities/content-memory.entity';
import { ContentMemoryService } from './content-memory.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContentMemoryEntity])],
  providers: [ContentMemoryService],
  exports: [ContentMemoryService],
})
export class ContentMemoryModule {}
