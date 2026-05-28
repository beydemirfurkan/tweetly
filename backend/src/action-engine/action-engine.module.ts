import { Module, type Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostActionEntity } from '@persistence/entities/post-action.entity';
import { ReplyActionEntity } from '@persistence/entities/reply-action.entity';
import { LikeActionEntity } from '@persistence/entities/like-action.entity';
import { BookmarkActionEntity } from '@persistence/entities/bookmark-action.entity';
import { RetweetActionEntity } from '@persistence/entities/retweet-action.entity';
import { FollowActionEntity } from '@persistence/entities/follow-action.entity';
import { QuoteActionEntity } from '@persistence/entities/quote-action.entity';
import { AccountsModule } from '@/accounts/accounts.module';
import { ControlStateRepository } from '@persistence/repositories/control-state.repository';
import { ActionAdminRepository } from '@persistence/repositories/action-admin.repository';
import { ActionRepositoryFactory } from '@persistence/repositories/action-repository.factory';
import { ActionQueueService } from './application/action-queue.service';
import { ExecutorRegistry } from './executor-registry.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ClaimWorker } from './claim-worker.service';
import { ActionEnqueueService } from './action-enqueue.service';
import { ACTION_STRATEGY } from './strategies/action-strategy.port';
import { ActionStrategyRegistry } from './strategies/action-strategy.registry';
import { PostActionStrategy } from './strategies/post.strategy';
import { ReplyActionStrategy } from './strategies/reply.strategy';
import { QuoteActionStrategy } from './strategies/quote.strategy';
import { LikeActionStrategy } from './strategies/like.strategy';
import { BookmarkActionStrategy } from './strategies/bookmark.strategy';
import { RetweetActionStrategy } from './strategies/retweet.strategy';
import { UnlikeActionStrategy } from './strategies/unlike.strategy';
import { UnretweetActionStrategy } from './strategies/unretweet.strategy';
import { DeleteTweetActionStrategy } from './strategies/delete-tweet.strategy';
import { FollowActionStrategy } from './strategies/follow.strategy';
import { UnfollowActionStrategy } from './strategies/unfollow.strategy';
import { DmActionStrategy } from './strategies/dm.strategy';
import { ProfileUpdateActionStrategy } from './strategies/profile-update.strategy';
import { AvatarUpdateActionStrategy } from './strategies/avatar-update.strategy';
import { BannerUpdateActionStrategy } from './strategies/banner-update.strategy';

const STRATEGY_CLASSES = [
  PostActionStrategy,
  ReplyActionStrategy,
  QuoteActionStrategy,
  LikeActionStrategy,
  BookmarkActionStrategy,
  RetweetActionStrategy,
  UnlikeActionStrategy,
  UnretweetActionStrategy,
  DeleteTweetActionStrategy,
  FollowActionStrategy,
  UnfollowActionStrategy,
  DmActionStrategy,
  ProfileUpdateActionStrategy,
  AvatarUpdateActionStrategy,
  BannerUpdateActionStrategy,
];

const STRATEGY_PROVIDERS: Provider[] = STRATEGY_CLASSES.flatMap((Strategy) => [
  Strategy,
  { provide: ACTION_STRATEGY, useExisting: Strategy, multi: true },
]);

@Module({
  imports: [
    AccountsModule,
    TypeOrmModule.forFeature([
      PostActionEntity,
      ReplyActionEntity,
      LikeActionEntity,
      BookmarkActionEntity,
      RetweetActionEntity,
      FollowActionEntity,
      QuoteActionEntity,
    ]),
  ],
  providers: [
    ExecutorRegistry,
    CircuitBreakerService,
    ClaimWorker,
    ActionEnqueueService,
    ActionQueueService,
    ControlStateRepository,
    ActionAdminRepository,
    ActionRepositoryFactory,
    ActionStrategyRegistry,
    ...STRATEGY_PROVIDERS,
  ],
  exports: [ExecutorRegistry, CircuitBreakerService, ActionEnqueueService, ActionQueueService, ActionRepositoryFactory, ActionStrategyRegistry],
})
export class ActionEngineModule {}
