import { Module } from '@nestjs/common';
import { ExternalTechSource } from './external-tech.source';
import { GithubTrendingSource } from './github-trending.source';

@Module({
  providers: [GithubTrendingSource, ExternalTechSource],
  exports: [GithubTrendingSource, ExternalTechSource],
})
export class TrendingSourceModule {}
