import { Injectable } from '@nestjs/common';
import { IdempotencyKeyService } from '@domain/services/idempotency-key';
import { ACTION_TABLE_CONFIG, type ActionTableConfig, type ClaimedDmRow } from '@persistence/repositories/action-repository';
import type { IActionStrategy } from './action-strategy.port';
import type { EnqueueDmInput } from './enqueue-inputs';

export interface DmActionPayload {
  target_handle: string;
  message: string;
}

@Injectable()
export class DmActionStrategy implements IActionStrategy<EnqueueDmInput, DmActionPayload, ClaimedDmRow> {
  readonly type = 'dm' as const;
  readonly tableConfig: ActionTableConfig = ACTION_TABLE_CONFIG.dm;

  constructor(private readonly keys: IdempotencyKeyService) {}

  idempotencyKey(input: EnqueueDmInput): string {
    return this.keys.forDm(input.accountId, input.targetHandle, input.message, input.scheduledAt);
  }

  toColumns(input: EnqueueDmInput): Record<string, unknown> {
    return { target_handle: input.targetHandle, message: input.message };
  }

  toPayload(row: ClaimedDmRow): DmActionPayload {
    return { target_handle: row.target_handle, message: row.message };
  }
}
