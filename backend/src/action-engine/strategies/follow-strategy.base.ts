import { IdempotencyKeyService } from '@domain/services/idempotency-key';
import type { ActionTableConfig, ClaimedFollowRow } from '@persistence/repositories/action-repository';
import type { ActionType } from '@domain/types/action.types';
import type { IActionStrategy } from './action-strategy.port';
import type { EnqueueFollowInput } from './enqueue-inputs';

export interface FollowPayload {
  targetHandle: string;
}

export interface FollowPayloadSnake {
  target_handle: string;
}

export abstract class FollowActionStrategyBase
  implements IActionStrategy<EnqueueFollowInput, FollowPayload | FollowPayloadSnake, ClaimedFollowRow>
{
  abstract readonly type: ActionType;
  abstract readonly tableConfig: ActionTableConfig;
  protected abstract keyFor(accountId: string, handle: string): string;
  protected readonly snakePayload: boolean = false;

  constructor(protected readonly keys: IdempotencyKeyService) {}

  idempotencyKey(input: EnqueueFollowInput): string {
    return this.keyFor(input.accountId, input.targetHandle);
  }

  toColumns(input: EnqueueFollowInput): Record<string, unknown> {
    return { target_handle: input.targetHandle };
  }

  toPayload(row: ClaimedFollowRow): FollowPayload | FollowPayloadSnake {
    return this.snakePayload
      ? { target_handle: row.target_handle }
      : { targetHandle: row.target_handle };
  }
}
