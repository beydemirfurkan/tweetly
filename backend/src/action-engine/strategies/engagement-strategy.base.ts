import { IdempotencyKeyService } from '@domain/services/idempotency-key';
import type { ActionTableConfig, ClaimedTweetEngagementRow } from '@persistence/repositories/action-repository';
import type { ActionType } from '@domain/types/action.types';
import { parseTweetId, type IActionStrategy } from './action-strategy.port';
import type { EnqueueEngagementInput } from './enqueue-inputs';

export interface EngagementPayload {
  targetTweetUrl: string;
}

export interface EngagementPayloadSnake {
  target_tweet_url: string;
}

export abstract class EngagementActionStrategyBase
  implements IActionStrategy<EnqueueEngagementInput, EngagementPayload | EngagementPayloadSnake, ClaimedTweetEngagementRow>
{
  abstract readonly type: ActionType;
  abstract readonly tableConfig: ActionTableConfig;
  protected abstract keyFor(accountId: string, tweetId: string): string;

  // When true, claim-worker payload uses snake_case (legacy executors that read
  // action.payload.target_tweet_url directly). When false, camelCase is used.
  protected readonly snakePayload: boolean = false;

  constructor(protected readonly keys: IdempotencyKeyService) {}

  idempotencyKey(input: EnqueueEngagementInput): string {
    return this.keyFor(input.accountId, parseTweetId(input.targetTweetUrl));
  }

  toColumns(input: EnqueueEngagementInput): Record<string, unknown> {
    return {
      target_tweet_url: input.targetTweetUrl,
      target_tweet_id: parseTweetId(input.targetTweetUrl),
    };
  }

  toPayload(row: ClaimedTweetEngagementRow): EngagementPayload | EngagementPayloadSnake {
    return this.snakePayload
      ? { target_tweet_url: row.target_tweet_url }
      : { targetTweetUrl: row.target_tweet_url };
  }
}
