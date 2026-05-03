import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostActionEntity } from '@persistence/entities/post-action.entity';
import { ReplyActionEntity } from '@persistence/entities/reply-action.entity';
import { LikeActionEntity } from '@persistence/entities/like-action.entity';
import { BookmarkActionEntity } from '@persistence/entities/bookmark-action.entity';
import { RetweetActionEntity } from '@persistence/entities/retweet-action.entity';
import { FollowActionEntity } from '@persistence/entities/follow-action.entity';
import { QuoteActionEntity } from '@persistence/entities/quote-action.entity';
import { AccountsModule } from '@/accounts/accounts.module';
import { ExecutorRegistry } from './executor-registry.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ClaimWorker } from './claim-worker.service';
import { ActionEnqueueService } from './action-enqueue.service';

@Module({
  imports: [
    // ActionEngine -> Accounts -> XAutomation -> ActionEngine cycle
    // (introduced when ProfileCacheService started depending on XDirectService).
    // forwardRef to break the circular evaluation.
    forwardRef(() => AccountsModule),
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
  providers: [ExecutorRegistry, CircuitBreakerService, ClaimWorker, ActionEnqueueService],
  exports: [ExecutorRegistry, CircuitBreakerService, ActionEnqueueService],
})
export class ActionEngineModule {}
