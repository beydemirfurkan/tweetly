import { Injectable } from '@nestjs/common';
import { IdempotencyKeyService } from '@domain/services/idempotency-key';
import { ACTION_TABLE_CONFIG, type ActionTableConfig, type ClaimedProfileUpdateRow } from '@persistence/repositories/action-repository';
import type { IActionStrategy } from './action-strategy.port';
import type { EnqueueProfileUpdateInput } from './enqueue-inputs';

export interface ProfileUpdateActionPayload {
  fields: Record<string, unknown>;
}

@Injectable()
export class ProfileUpdateActionStrategy
  implements IActionStrategy<EnqueueProfileUpdateInput, ProfileUpdateActionPayload, ClaimedProfileUpdateRow>
{
  readonly type = 'profile_update' as const;
  readonly tableConfig: ActionTableConfig = ACTION_TABLE_CONFIG.profile_update;

  constructor(private readonly keys: IdempotencyKeyService) {}

  idempotencyKey(input: EnqueueProfileUpdateInput): string {
    return this.keys.forProfileUpdate(input.accountId, input.fields);
  }

  toColumns(input: EnqueueProfileUpdateInput): Record<string, unknown> {
    return { fields: JSON.stringify(input.fields) };
  }

  toPayload(row: ClaimedProfileUpdateRow): ProfileUpdateActionPayload {
    return { fields: row.fields };
  }
}
