import type { ActionContext, XSession } from '@domain/ports/x-action-executor.port';
import type { ActionType } from '@domain/types/action.types';
import type {
  XDirectWriteService,
  XDirectProfileService,
} from '@/x-automation/x-direct';
import type { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { AuthRequiredError } from '@/x-automation/browser/auth-required-error';

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
 * XDirectWriteService mock for unlike/unretweet/unfollow/delete-tweet/dm
 * executor specs. Every method resolves to ok by default; per-method
 * overrides via `overrides`.
 */
export function mockXDirectWrite(
  overrides: Partial<Record<keyof XDirectWriteService, jest.Mock>> = {},
): jest.Mocked<XDirectWriteService> {
  return {
    unlikeTweet: jest.fn().mockResolvedValue({ ok: true }),
    unretweetTweet: jest.fn().mockResolvedValue({ ok: true }),
    unfollowAccount: jest.fn().mockResolvedValue({ ok: true }),
    deleteTweet: jest.fn().mockResolvedValue({ ok: true }),
    sendDm: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  } as unknown as jest.Mocked<XDirectWriteService>;
}

/**
 * XDirectProfileService mock for profile-update/avatar-update/banner-update
 * executor specs.
 */
export function mockXDirectProfile(
  overrides: Partial<Record<keyof XDirectProfileService, jest.Mock>> = {},
): jest.Mocked<XDirectProfileService> {
  return {
    updateProfile: jest.fn().mockResolvedValue({ ok: true, updated: ['name'] }),
    updateAvatar: jest.fn().mockResolvedValue({ ok: true }),
    updateBanner: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  } as unknown as jest.Mocked<XDirectProfileService>;
}

export const authError = (msg = 'session expired'): AuthRequiredError =>
  new AuthRequiredError(msg);
