import { Injectable, NotFoundException } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AccountsService } from '@/accounts/accounts.service';
import { ActionQueueService } from '@/action-engine/application/action-queue.service';
import type { ActionType } from '@domain/types/action.types';
import { McpSessionRouter } from './mcp-session-router.service';
import { LoginJobsRepository } from '@/x-automation/login/login-jobs.repository';
import { TOOL_DEFINITIONS } from './handlers/tool-definitions';
import type { McpToolArgs, McpToolContext } from './handlers/mcp-tool.context';
import { TOOL_SCHEMAS, type ToolName, formatZodError } from './handlers/tool-schemas';
import { McpRouter } from './mcp-router.service';

@Injectable()
export class McpService {
  private transports = new Map<string, SSEServerTransport>();
  private sessionUserMap = new Map<string, string>();

  constructor(
    private readonly accounts: AccountsService,
    private readonly queue: ActionQueueService,
    private readonly sessionRouter: McpSessionRouter,
    private readonly loginJobs: LoginJobsRepository,
    private readonly router: McpRouter,
  ) {}

  get instanceId(): string {
    return this.sessionRouter.instanceId;
  }

  getTransport(sessionId: string): SSEServerTransport | undefined {
    return this.transports.get(sessionId);
  }

  setTransport(sessionId: string, transport: SSEServerTransport, userId: string): void {
    this.transports.set(sessionId, transport);
    this.sessionUserMap.set(sessionId, userId);
    this.sessionRouter.register(sessionId).catch(() => undefined);
  }

  deleteTransport(sessionId: string): void {
    this.transports.delete(sessionId);
    this.sessionUserMap.delete(sessionId);
    this.sessionRouter.unregister(sessionId).catch(() => undefined);
  }

  async lookupSessionHost(sessionId: string): Promise<string | null> {
    return this.sessionRouter.lookupHost(sessionId);
  }

  getSessionUserId(sessionId: string): string | undefined {
    return this.sessionUserMap.get(sessionId);
  }

  createServer(userId: string): Server {
    const server = new Server(
      { name: 'xtweetly-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_DEFINITIONS,
    }));

    server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const args = (req.params.arguments ?? {}) as McpToolArgs;
      return this.handleTool(userId, req.params.name, args);
    });

    return server;
  }

  private async handleTool(
    userId: string,
    name: string,
    args: McpToolArgs,
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
    try {
      const result = await this.dispatch(userId, name, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  }

  private async dispatch(userId: string, name: string, raw: McpToolArgs): Promise<unknown> {
    const schema = TOOL_SCHEMAS[name as ToolName];
    if (!schema) throw new Error(`Unknown tool: ${name}`);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for ${name}: ${formatZodError(parsed.error)}`);
    }
    // The router holds tool-name → handler-method routes built at bootstrap
    // by McpToolBindings (Record<ToolName, …> for build-time drift safety).
    return this.router.dispatch(name, parsed.data as McpToolArgs, this.buildContext(userId));
  }

  private buildContext(userId: string): McpToolContext {
    return {
      userId,
      resolveAccountId: (candidate?: string) => this.resolveAccountId(userId, candidate),
      resolveAccountIdOptional: (candidate?: string) => this.resolveAccountIdOptional(userId, candidate),
      userAccountIdSet: () => this.userAccountIdSet(userId),
      assertAccountOwnership: (accountId: string) => this.assertAccountOwnership(userId, accountId),
      assertActionOwnership: (type: ActionType, id: string) => this.assertActionOwnership(userId, type, id),
      assertLoginCooldownIsClear: (username: string) => this.assertLoginCooldownIsClear(userId, username),
    };
  }

  private async resolveAccountId(userId: string, candidate?: string): Promise<string> {
    if (candidate) {
      const acct = await this.accounts.findByIdForUser(candidate, userId);
      if (!acct) throw new NotFoundException(`Account ${candidate} not found`);
      return acct.id;
    }
    const active = await this.accounts.listActiveForUser(userId);
    if (active.length === 0) {
      throw new Error('no active account; specify account_id or connect one first');
    }
    return active[0].id;
  }

  private async resolveAccountIdOptional(userId: string, candidate?: string): Promise<string | undefined> {
    if (candidate) {
      const acct = await this.accounts.findByIdForUser(candidate, userId);
      if (!acct) throw new NotFoundException(`Account ${candidate} not found`);
      return acct.id;
    }
    const active = await this.accounts.listActiveForUser(userId);
    return active[0]?.id;
  }

  private async userAccountIdSet(userId: string): Promise<Set<string>> {
    const list = await this.accounts.listAllForUser(userId);
    return new Set(list.map((a) => a.id));
  }

  private async assertAccountOwnership(userId: string, accountId: string): Promise<void> {
    const acct = await this.accounts.findByIdForUser(accountId, userId);
    if (!acct) throw new NotFoundException(`Account ${accountId} not found`);
  }

  private async assertActionOwnership(userId: string, type: ActionType, id: string): Promise<void> {
    const accountId = await this.queue.findActionAccountId(type, id);
    if (!accountId) throw new NotFoundException(`Action ${id} not found`);
    await this.assertAccountOwnership(userId, accountId);
  }

  private async assertLoginCooldownIsClear(userId: string, username: string): Promise<void> {
    const cooldown = await this.loginJobs.findActiveCooldown(userId, username);
    if (!cooldown) return;

    const prefix = cooldown.manualReviewRequired
      ? 'Login blocked after repeated failures; manual review recommended.'
      : 'Login blocked after a recent failure.';
    throw new Error(`${prefix} retry_after_sec=${cooldown.retryAfterSec} retry_at=${cooldown.retryAt}`);
  }
}
