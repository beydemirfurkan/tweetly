import { Module } from '@nestjs/common';
import { GithubTrendingSource } from './github-trending.source';

@Module({
  providers: [GithubTrendingSource],
  exports: [GithubTrendingSource],
})
export class TrendingSourceModule {}
