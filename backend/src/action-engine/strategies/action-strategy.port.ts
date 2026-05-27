import type { ActionType } from '@domain/types/action.types';
import type { ActionTableConfig, ClaimedActionRow } from '@persistence/repositories/action-repository';

export interface ActionEnqueueBase {
  accountId: string;
  scheduledAt: Date;
  maxAttempts?: number;
  metadata?: Record<string, unknown>;
  parentActionRef?: string | null;
}

export interface IActionStrategy<
  TInput extends ActionEnqueueBase = ActionEnqueueBase,
  TPayload = unknown,
  TRow extends ClaimedActionRow = ClaimedActionRow,
> {
  readonly type: ActionType;
  readonly tableConfig: ActionTableConfig;
  idempotencyKey(input: TInput): string;
  toColumns(input: TInput): Record<string, unknown>;
  toPayload(row: TRow): TPayload;
}

export const ACTION_STRATEGY = Symbol('IActionStrategy');

export function parseTweetId(url: string): string {
  const m = url.match(/\/status\/(\d+)/);
  if (!m) throw new Error(`Invalid tweet URL: ${url}`);
  return m[1];
}
