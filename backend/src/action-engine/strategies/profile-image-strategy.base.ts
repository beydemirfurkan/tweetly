import { IdempotencyKeyService } from '@domain/services/idempotency-key';
import type { ActionTableConfig, ClaimedProfileImageRow } from '@persistence/repositories/action-repository';
import type { ActionType } from '@domain/types/action.types';
import type { IActionStrategy } from './action-strategy.port';
import type { EnqueueProfileImageInput } from './enqueue-inputs';

export interface ProfileImageActionPayload {
  file_path: string;
}

export abstract class ProfileImageActionStrategyBase
  implements IActionStrategy<EnqueueProfileImageInput, ProfileImageActionPayload, ClaimedProfileImageRow>
{
  abstract readonly type: ActionType;
  abstract readonly tableConfig: ActionTableConfig;
  protected abstract keyFor(accountId: string, filePath: string): string;

  constructor(protected readonly keys: IdempotencyKeyService) {}

  idempotencyKey(input: EnqueueProfileImageInput): string {
    return this.keyFor(input.accountId, input.filePath);
  }

  toColumns(input: EnqueueProfileImageInput): Record<string, unknown> {
    return { file_path: input.filePath };
  }

  toPayload(row: ClaimedProfileImageRow): ProfileImageActionPayload {
    return { file_path: row.file_path };
  }
}
