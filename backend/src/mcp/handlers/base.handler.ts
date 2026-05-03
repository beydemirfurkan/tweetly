import type { ActionType } from '@domain/types/action.types';
import type { McpToolContext } from './mcp-tool.context';

/**
 * Marker base for MCP tool handlers. Argument validation happens centrally
 * in McpService.dispatch (Zod parse against TOOL_SCHEMAS) before any handler
 * runs, so handlers receive already-typed data and only need to assert
 * tenant ownership of the resources they're about to touch.
 *
 * The protected helpers below are the only ownership shape we currently
 * share; if a 6th cross-cutting concern (metrics per call, structured logs,
 * audit trail) shows up, add it here rather than duplicating across the
 * five handler classes.
 */
export abstract class BaseMcpHandler {
  protected async requireOwnedAccount(
    ctx: McpToolContext,
    candidate: string | undefined,
  ): Promise<string> {
    const accountId = await ctx.resolveAccountId(candidate);
    await ctx.assertAccountOwnership(accountId);
    return accountId;
  }

  protected async requireOwnedAction(
    ctx: McpToolContext,
    type: ActionType,
    actionId: string,
  ): Promise<void> {
    await ctx.assertActionOwnership(type, actionId);
  }
}
