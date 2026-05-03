import type { ActionType } from '@domain/types/action.types';

/**
 * Context passed to every MCP tool handler. Carries the authenticated user
 * and the shared ownership/cooldown helpers that need to consult the user's
 * account/action set. Handlers use this instead of pulling repos directly
 * so they can be unit-tested with a hand-rolled context.
 */
export interface McpToolContext {
  readonly userId: string;
  resolveAccountId(candidate?: string): Promise<string>;
  resolveAccountIdOptional(candidate?: string): Promise<string | undefined>;
  userAccountIdSet(): Promise<Set<string>>;
  assertAccountOwnership(accountId: string): Promise<void>;
  assertActionOwnership(type: ActionType, id: string): Promise<void>;
  assertLoginCooldownIsClear(username: string): Promise<void>;
}

export type McpToolArgs = Record<string, unknown>;
