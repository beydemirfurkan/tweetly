import { Injectable, NotFoundException } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AccountsService } from '@/accounts/accounts.service';
import { AdminApiService } from '@/admin-api/admin-api.service';
import type { ActionType } from '@domain/types/action.types';
import { McpSessionRouter } from './mcp-session-router.service';
import { LoginJobsRepository } from '@/x-automation/login/login-jobs.repository';
import { TOOL_DEFINITIONS } from './handlers/tool-definitions';
import type { McpToolArgs, McpToolContext } from './handlers/mcp-tool.context';
import { TOOL_SCHEMAS, type ToolName, formatZodError } from './handlers/tool-schemas';
import { WriteHandler } from './handlers/write.handler';
import { ProfileHandler } from './handlers/profile.handler';
import { ReadHandler } from './handlers/read.handler';
import { MonitorHandler } from './handlers/monitor.handler';
import { AccountHandler } from './handlers/account.handler';
import { ExtractionHandler } from './handlers/extraction.handler';

@Injectable()
export class McpService {
  private transports = new Map<string, SSEServerTransport>();
  private sessionUserMap = new Map<string, string>();

  constructor(
    private readonly accounts: AccountsService,
    private readonly adminApi: AdminApiService,
    private readonly sessionRouter: McpSessionRouter,
    private readonly loginJobs: LoginJobsRepository,
    private readonly writeHandler: WriteHandler,
    private readonly profileHandler: ProfileHandler,
    private readonly readHandler: ReadHandler,
    private readonly monitorHandler: MonitorHandler,
    private readonly accountHandler: AccountHandler,
    private readonly extractionHandler: ExtractionHandler,
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
      { name: 'tweetly-mcp', version: '1.0.0' },
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
    // From here every handler receives a typed, validated args object —
    // the `as never` widens the union back into the per-case type that
    // each handler method declares. The drift spec keeps the two lists
    // in sync at test time.
    const args = parsed.data as never;
    const ctx = this.buildContext(userId);
    const w = this.writeHandler;
    const p = this.profileHandler;
    const r = this.readHandler;
    const m = this.monitorHandler;
    const a = this.accountHandler;
    const e = this.extractionHandler;

    switch (name) {
      // Queue-backed writes
      case 'post_tweet': return w.postTweet(args, ctx);
      case 'reply_to_tweet': return w.replyToTweet(args, ctx);
      case 'like_tweet': return w.likeTweet(args, ctx);
      case 'retweet_tweet': return w.retweet(args, ctx);
      case 'quote_tweet': return w.quoteTweet(args, ctx);
      case 'bookmark_tweet': return w.bookmarkTweet(args, ctx);
      case 'follow_account': return w.followAccount(args, ctx);
      case 'post_thread': return w.postThread(args, ctx);

      // Queue-backed writes (formerly synchronous via XDirectService).
      // After the consistency sprint these all go through the action engine
      // so retry / idempotency / observability match the other write tools.
      case 'unlike_tweet': return p.unlikeTweet(args, ctx);
      case 'unretweet_tweet': return p.unretweet(args, ctx);
      case 'unfollow_account': return p.unfollowAccount(args, ctx);
      case 'delete_tweet': return p.deleteTweet(args, ctx);
      case 'send_dm': return p.sendDm(args, ctx);
      case 'update_profile': return p.updateProfile(args, ctx);
      case 'update_avatar': return p.updateAvatar(args, ctx);
      case 'update_banner': return p.updateBanner(args, ctx);

      // Reads
      case 'search_tweets': return r.searchTweets(args, ctx);
      case 'get_user': return r.getUser(args, ctx);
      case 'get_tweet': return r.getTweet(args, ctx);
      case 'get_user_tweets': return r.getUserTweets(args, ctx);
      case 'search_users': return r.searchUsers(args, ctx);
      case 'get_user_followers': return r.getUserFollowers(args, ctx);
      case 'get_user_following': return r.getUserFollowing(args, ctx);
      case 'get_tweet_retweeters': return r.getTweetRetweeters(args, ctx);
      case 'get_tweet_quotes': return r.getTweetQuotes(args, ctx);
      case 'get_tweet_replies': return r.getTweetReplies(args, ctx);
      case 'get_user_mentions': return r.getUserMentions(args, ctx);
      case 'get_x_trending': return r.getXTrending(args, ctx);
      case 'get_user_likes': return r.getUserLikes(args, ctx);
      case 'get_my_bookmarks': return r.getMyBookmarks(args, ctx);
      case 'get_list_members': return r.getListMembers(args, ctx);
      case 'get_mutual_followers': return r.getMutualFollowers(args, ctx);
      case 'get_thread': return r.getThread(args, ctx);

      // Monitors
      case 'create_monitor': return m.createMonitor(args, ctx);
      case 'list_monitors': return m.listMonitors(args, ctx);
      case 'get_monitor': return m.getMonitor(args, ctx);
      case 'delete_monitor': return m.deleteMonitor(args, ctx);
      case 'pause_monitor': return m.pauseMonitor(args, ctx);

      // Extractions
      case 'create_extraction': return e.createExtraction(args, ctx);
      case 'get_extraction': return e.getExtraction(args, ctx);
      case 'list_extractions': return e.listExtractions(args, ctx);
      case 'cancel_extraction': return e.cancelExtraction(args, ctx);

      // Accounts, login, action queue, settings
      case 'get_accounts': return a.getAccounts(args, ctx);
      case 'get_account_health': return a.getAccountHealth(args, ctx);
      case 'connect_x_account': return a.connectXAccount(args, ctx);
      case 'reauth_x_account': return a.reauthXAccount(args, ctx);
      case 'get_x_login_job': return a.getXLoginJob(args, ctx);
      case 'list_actions': return a.listActions(args, ctx);
      case 'cancel_action': return a.cancelAction(args, ctx);
      case 'replay_action': return a.replayAction(args, ctx);
      case 'get_settings': return a.getSettings(args, ctx);
      case 'update_settings': return a.updateSettings(args, ctx);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
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
    const accountId = await this.adminApi.findActionAccountId(type, id);
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
