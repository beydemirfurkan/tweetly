import type { McpToolContext } from '../mcp-tool.context';

/**
 * Hand-rolled McpToolContext for handler specs. All helpers default to
 * "the user owns acc-1 and nothing is on cooldown"; tests override per-case.
 */
export function fakeContext(overrides: Partial<McpToolContext> = {}): McpToolContext {
  return {
    userId: 'user-1',
    resolveAccountId: jest.fn().mockResolvedValue('acc-1'),
    resolveAccountIdOptional: jest.fn().mockResolvedValue('acc-1'),
    userAccountIdSet: jest.fn().mockResolvedValue(new Set(['acc-1'])),
    assertAccountOwnership: jest.fn().mockResolvedValue(undefined),
    assertActionOwnership: jest.fn().mockResolvedValue(undefined),
    assertLoginCooldownIsClear: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
