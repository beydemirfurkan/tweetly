import type { ActionContext, XSession } from '../../../domain/ports/x-action-executor.port';
import type { ActionType } from '../../../domain/types/action.types';
import type { XDirectService } from '../../x-direct.service';
import type { ExecutorRegistry } from '../../../action-engine/executor-registry.service';
import { AuthRequiredError } from '../../browser/auth-required-error';

/**
 * Shared mocks/fixtures for the queue-backed direct-action executors.
 * Each spec instantiates its executor with these and asserts the
 * delegate-and-classify behavior.
 */

export function fakeSession(accountId = 'acc-1'): XSession {
  return { accountId, authToken: 'tok' };
}

export function fakeAction<T>(
  payload: T,
  type: ActionType,
  accountId = 'acc-1',
): ActionContext<T> {
  return { id: 'act-1', type, accountId, attempts: 0, payload, metadata: {} };
}

export function fakeRegistry(): jest.Mocked<ExecutorRegistry> {
  return {
    register: jest.fn(),
    resolve: jest.fn(),
    resolveOrThrow: jest.fn(),
    registered: jest.fn(),
  } as unknown as jest.Mocked<ExecutorRegistry>;
}

/**
 * Creates a mock XDirectService where every write method resolves to ok by
 * default; tests can override per-method via the `overrides` arg.
 */
export function mockXDirect(
  overrides: Partial<Record<keyof XDirectService, jest.Mock>> = {},
): jest.Mocked<XDirectService> {
  return {
    unlikeTweet: jest.fn().mockResolvedValue({ ok: true }),
    unretweetTweet: jest.fn().mockResolvedValue({ ok: true }),
    unfollowAccount: jest.fn().mockResolvedValue({ ok: true }),
    deleteTweet: jest.fn().mockResolvedValue({ ok: true }),
    sendDm: jest.fn().mockResolvedValue({ ok: true }),
    updateProfile: jest.fn().mockResolvedValue({ ok: true, updated: ['name'] }),
    updateAvatar: jest.fn().mockResolvedValue({ ok: true }),
    updateBanner: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  } as unknown as jest.Mocked<XDirectService>;
}

export const authError = (msg = 'session expired'): AuthRequiredError =>
  new AuthRequiredError(msg);
