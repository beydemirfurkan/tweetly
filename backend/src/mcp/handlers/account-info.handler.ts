import { Injectable } from '@nestjs/common';
import { AccountsService } from '@/accounts/accounts.service';
import { BaseMcpHandler } from './base.handler';
import type { McpToolArgs, McpToolContext } from './mcp-tool.context';

/**
 * Read-only account inventory: list the caller's accounts and report
 * session health. Pure projection of AccountsService rows — no writes,
 * no login lifecycle.
 */
@Injectable()
export class AccountInfoHandler extends BaseMcpHandler {
  constructor(private readonly accounts: AccountsService) {
    super();
  }

  async getAccounts(_args: McpToolArgs, ctx: McpToolContext) {
    const list = await this.accounts.listAllForUser(ctx.userId);
    return {
      count: list.length,
      accounts: list.map((a) => ({
        id: a.id,
        displayName: a.displayName,
        status: a.status,
        hasAuthToken: Boolean(a.authToken),
        createdAt: a.createdAt,
        lastUsedAt: a.lastUsedAt,
      })),
    };
  }

  async getAccountHealth(args: McpToolArgs, ctx: McpToolContext) {
    const accountId = await ctx.resolveAccountId(args.account_id as string | undefined);
    const account = await this.accounts.findByIdForUser(accountId, ctx.userId);
    if (!account) throw new Error(`Account not found: ${accountId}`);
    const health = await this.accounts.getSessionHealth(accountId);
    return {
      accountId: account.id,
      status: account.status,
      displayName: account.displayName,
      ...health,
    };
  }
}
