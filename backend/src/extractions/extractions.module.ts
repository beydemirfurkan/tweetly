import { Module, type Provider } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { AccountsModule } from '@/accounts/accounts.module';
import { CryptoModule } from '@/common/crypto/crypto.module';
import { XDirectModule } from '@/x-automation/x-direct/x-direct.module';
import { ExtractionJobsRepository } from './extraction-jobs.repository';
import { ExtractionService } from './extraction.service';
import { ExtractionWorker } from './extraction-worker.service';
import { ExtractionsController } from './extractions.controller';
import { EXTRACTION_STRATEGY } from './strategies/extraction-strategy.port';
import { ExtractionStrategyRegistry } from './strategies/extraction-strategy.registry';
import { UserFollowersExtractionStrategy } from './strategies/user-followers.strategy';
import { UserFollowingExtractionStrategy } from './strategies/user-following.strategy';
import { UserTweetsExtractionStrategy } from './strategies/user-tweets.strategy';
import { UserLikesExtractionStrategy } from './strategies/user-likes.strategy';
import { UserMentionsExtractionStrategy } from './strategies/user-mentions.strategy';
import { TweetRetweetersExtractionStrategy } from './strategies/tweet-retweeters.strategy';
import { SearchTweetsExtractionStrategy } from './strategies/search-tweets.strategy';
import { ListMembersExtractionStrategy } from './strategies/list-members.strategy';

const STRATEGY_CLASSES = [
  UserFollowersExtractionStrategy,
  UserFollowingExtractionStrategy,
  UserTweetsExtractionStrategy,
  UserLikesExtractionStrategy,
  UserMentionsExtractionStrategy,
  TweetRetweetersExtractionStrategy,
  SearchTweetsExtractionStrategy,
  ListMembersExtractionStrategy,
];

const STRATEGY_PROVIDERS: Provider[] = STRATEGY_CLASSES.flatMap((Strategy) => [
  Strategy,
  { provide: EXTRACTION_STRATEGY, useExisting: Strategy, multi: true },
]);

@Module({
  imports: [
    AccountsModule,
    AuthModule,
    CryptoModule,
    XDirectModule,
  ],
  controllers: [ExtractionsController],
  providers: [
    ExtractionJobsRepository,
    ExtractionService,
    ExtractionWorker,
    ExtractionStrategyRegistry,
    ...STRATEGY_PROVIDERS,
  ],
  exports: [ExtractionService, ExtractionJobsRepository],
})
export class ExtractionsModule {}
