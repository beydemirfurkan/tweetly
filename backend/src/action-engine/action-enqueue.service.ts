import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import { ActionRepositoryFactory } from '@persistence/repositories/action-repository.factory';
import { ActionStrategyRegistry } from './strategies/action-strategy.registry';
import type { ActionEnqueueBase } from './strategies/action-strategy.port';
import type {
  EnqueueDmInput,
  EnqueueEngagementInput,
  EnqueueFollowInput,
  EnqueuePostInput,
  EnqueueProfileImageInput,
  EnqueueProfileUpdateInput,
  EnqueueQuoteInput,
  EnqueueReplyInput,
} from './strategies/enqueue-inputs';

export type {
  EnqueuePostInput,
  EnqueueReplyInput,
  EnqueueEngagementInput,
  EnqueueFollowInput,
  EnqueueQuoteInput,
  EnqueueDmInput,
  EnqueueProfileUpdateInput,
  EnqueueProfileImageInput,
};

export interface EnqueueResult {
  id: string | null;
  idempotencyKey: string;
}

@Injectable()
export class ActionEnqueueService {
  constructor(
    private readonly strategies: ActionStrategyRegistry,
    private readonly repoFactory: ActionRepositoryFactory,
  ) {}

  async enqueue<TInput extends ActionEnqueueBase>(type: ActionType, input: TInput): Promise<EnqueueResult> {
    const strategy = this.strategies.forType<TInput>(type);
    const repo = this.repoFactory.for(strategy.tableConfig);
    const idempotencyKey = strategy.idempotencyKey(input);
    const id = await repo.insertIfAbsent({
      idempotencyKey,
      accountId: input.accountId,
      scheduledAt: input.scheduledAt,
      maxAttempts: input.maxAttempts,
      parentActionRef: input.parentActionRef ?? null,
      metadata: input.metadata,
      typeSpecific: strategy.toColumns(input),
    });
    return { id, idempotencyKey };
  }

  enqueuePost(input: EnqueuePostInput): Promise<EnqueueResult> {
    return this.enqueue('post', input);
  }

  enqueueReply(input: EnqueueReplyInput): Promise<EnqueueResult> {
    return this.enqueue('reply', input);
  }

  enqueueLike(input: EnqueueEngagementInput): Promise<EnqueueResult> {
    return this.enqueue('like', input);
  }

  enqueueBookmark(input: EnqueueEngagementInput): Promise<EnqueueResult> {
    return this.enqueue('bookmark', input);
  }

  enqueueRetweet(input: EnqueueEngagementInput): Promise<EnqueueResult> {
    return this.enqueue('retweet', input);
  }

  enqueueFollow(input: EnqueueFollowInput): Promise<EnqueueResult> {
    return this.enqueue('follow', input);
  }

  enqueueQuote(input: EnqueueQuoteInput): Promise<EnqueueResult> {
    return this.enqueue('quote', input);
  }

  enqueueUnlike(input: EnqueueEngagementInput): Promise<EnqueueResult> {
    return this.enqueue('unlike', input);
  }

  enqueueUnretweet(input: EnqueueEngagementInput): Promise<EnqueueResult> {
    return this.enqueue('unretweet', input);
  }

  enqueueUnfollow(input: EnqueueFollowInput): Promise<EnqueueResult> {
    return this.enqueue('unfollow', input);
  }

  enqueueDeleteTweet(input: EnqueueEngagementInput): Promise<EnqueueResult> {
    return this.enqueue('delete_tweet', input);
  }

  enqueueDm(input: EnqueueDmInput): Promise<EnqueueResult> {
    return this.enqueue('dm', input);
  }

  enqueueProfileUpdate(input: EnqueueProfileUpdateInput): Promise<EnqueueResult> {
    return this.enqueue('profile_update', input);
  }

  enqueueAvatarUpdate(input: EnqueueProfileImageInput): Promise<EnqueueResult> {
    return this.enqueue('avatar_update', input);
  }

  enqueueBannerUpdate(input: EnqueueProfileImageInput): Promise<EnqueueResult> {
    return this.enqueue('banner_update', input);
  }
}
