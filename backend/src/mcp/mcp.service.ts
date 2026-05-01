import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Server } from '@modelcontextprotocol/sdk/server';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AccountsService } from '../accounts/accounts.service';
import { AdminApiService } from '../admin-api/admin-api.service';
import { SettingsService } from '../settings/settings.service';
import { ActionEnqueueService } from '../action-engine/action-enqueue.service';
import type { ActionType, ActionStatus } from '../domain/types/action.types';
import { ACTION_TYPES, ACTION_STATUSES } from '../domain/types/action.types';
import { XDirectService } from '../x-automation/x-direct.service';
import { XBrowserService } from '../x-automation/browser/x-browser.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { McpSessionRouter } from './mcp-session-router.service';
import { CredentialCipherService } from '../common/crypto/credential-cipher.service';
import { LoginJobsRepository } from '../x-automation/login/login-jobs.repository';
import {
  LoginValidationError,
  assertBase32Secret,
  normalizeUsername,
  requireString,
} from '../x-automation/login/login-validation';

const TOOL_DEFINITIONS = [
  {
    name: 'post_tweet',
    description: 'Post a tweet from a Twitter/X account',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Tweet text (max 280 chars)' },
        account_id: { type: 'string', description: 'Account ID to post from (uses first active account if omitted)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'reply_to_tweet',
    description: 'Reply to a tweet',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Reply text' },
        parent_tweet_url: { type: 'string', description: 'URL of the tweet to reply to (must contain /status/)' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
      },
      required: ['text', 'parent_tweet_url'],
    },
  },
  {
    name: 'like_tweet',
    description: 'Like a tweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string', description: 'URL of the tweet to like (must contain /status/)' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'retweet',
    description: 'Retweet a tweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string', description: 'URL of the tweet to retweet (must contain /status/)' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'quote_tweet',
    description: 'Quote tweet with your own comment',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Your comment text' },
        tweet_url: { type: 'string', description: 'URL of the tweet to quote (must contain /status/)' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
      },
      required: ['text', 'tweet_url'],
    },
  },
  {
    name: 'bookmark_tweet',
    description: 'Bookmark a tweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string', description: 'URL of the tweet to bookmark (must contain /status/)' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'follow_account',
    description: 'Follow a Twitter/X account',
    inputSchema: {
      type: 'object',
      properties: {
        target_handle: { type: 'string', description: 'Handle of the account to follow (without @)' },
        account_id: { type: 'string', description: 'Account ID to follow from (optional)' },
      },
      required: ['target_handle'],
    },
  },
  {
    name: 'post_thread',
    description: 'Post multiple tweets as a thread',
    inputSchema: {
      type: 'object',
      properties: {
        tweets: { type: 'array', items: { type: 'string' }, description: 'Array of tweet texts' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
      },
      required: ['tweets'],
    },
  },
  {
    name: 'unlike_tweet',
    description: 'Remove a like from a tweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string' },
        account_id: { type: 'string' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'unretweet',
    description: 'Undo a retweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string' },
        account_id: { type: 'string' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'unfollow_account',
    description: 'Unfollow a Twitter/X account',
    inputSchema: {
      type: 'object',
      properties: {
        target_handle: { type: 'string' },
        account_id: { type: 'string' },
      },
      required: ['target_handle'],
    },
  },
  {
    name: 'delete_tweet',
    description: 'Delete a tweet permanently',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string' },
        account_id: { type: 'string' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'send_dm',
    description: 'Send a direct message to a Twitter/X user',
    inputSchema: {
      type: 'object',
      properties: {
        target_handle: { type: 'string' },
        message: { type: 'string' },
        account_id: { type: 'string' },
      },
      required: ['target_handle', 'message'],
    },
  },
  {
    name: 'update_profile',
    description: 'Update Twitter/X profile fields (name, bio, location, website)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        bio: { type: 'string' },
        location: { type: 'string' },
        website: { type: 'string' },
        account_id: { type: 'string' },
      },
    },
  },
  {
    name: 'search_tweets',
    description: 'Search Twitter/X for tweets matching a query',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', description: 'Max results (default 20, max 50)' },
        account_id: { type: 'string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_user',
    description: 'Get a Twitter/X user profile',
    inputSchema: {
      type: 'object',
      properties: {
        handle: { type: 'string' },
        account_id: { type: 'string' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'get_tweet',
    description: 'Get details of a specific tweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string' },
        account_id: { type: 'string' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'get_user_tweets',
    description: "Get a user's recent tweets",
    inputSchema: {
      type: 'object',
      properties: {
        handle: { type: 'string' },
        limit: { type: 'number' },
        account_id: { type: 'string' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'search_users',
    description: 'Search for Twitter/X users by name or handle',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
        account_id: { type: 'string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_user_followers',
    description: "Get a list of a user's followers",
    inputSchema: {
      type: 'object',
      properties: {
        handle: { type: 'string' },
        limit: { type: 'number' },
        account_id: { type: 'string' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'get_x_trending',
    description: 'Get current trending topics on Twitter/X',
    inputSchema: {
      type: 'object',
      properties: { account_id: { type: 'string' } },
    },
  },
  {
    name: 'create_monitor',
    description: 'Monitor an account and receive webhook notifications when they post new tweets',
    inputSchema: {
      type: 'object',
      properties: {
        target_handle: { type: 'string' },
        webhook_url: { type: 'string' },
        account_id: { type: 'string' },
        event_types: {
          type: 'array',
          items: { type: 'string', enum: ['tweet.new'] },
        },
      },
      required: ['target_handle', 'webhook_url'],
    },
  },
  {
    name: 'list_monitors',
    description: 'List your monitors',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_monitor',
    description: 'Get monitor details and recent webhook deliveries',
    inputSchema: {
      type: 'object',
      properties: { monitor_id: { type: 'string' } },
      required: ['monitor_id'],
    },
  },
  {
    name: 'delete_monitor',
    description: 'Permanently delete a monitor',
    inputSchema: {
      type: 'object',
      properties: { monitor_id: { type: 'string' } },
      required: ['monitor_id'],
    },
  },
  {
    name: 'pause_monitor',
    description: 'Pause a monitor without deleting it',
    inputSchema: {
      type: 'object',
      properties: { monitor_id: { type: 'string' } },
      required: ['monitor_id'],
    },
  },
  {
    name: 'get_accounts',
    description: 'List your configured Twitter/X accounts',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'connect_x_account',
    description:
      'Queue a server-side login job that connects a new X account using username/password ' +
      '(plus optional TOTP base32 secret). Returns a job_id; call get_x_login_job to poll status. ' +
      'Typical login takes 20-40 seconds. Credentials are encrypted at rest; the password is wiped ' +
      'after the login completes. Set save_totp_secret=true to persist the TOTP secret for future reauth.',
    inputSchema: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'X handle (without @)' },
        email: { type: 'string', description: 'Optional unless X asks for an unusual-login challenge' },
        password: { type: 'string' },
        totp_secret: { type: 'string', description: 'Base32 TOTP secret (NOT the 6-digit code)' },
        save_totp_secret: { type: 'boolean', default: false },
      },
      required: ['username', 'password'],
    },
  },
  {
    name: 'reauth_x_account',
    description:
      'Re-authenticate an existing connected X account whose session has expired. Same flow as ' +
      'connect_x_account but writes the new cookies onto an existing account row. The login must ' +
      'resolve to the same handle as account_id; otherwise the job fails with invalid_credentials.',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'The X handle of the account being re-authed' },
        password: { type: 'string' },
        totp_secret: { type: 'string', description: 'Optional; reuses stored secret if account opted in' },
        save_totp_secret: { type: 'boolean', default: false },
        email: { type: 'string', description: 'Optional; updates stored email' },
      },
      required: ['account_id', 'password'],
    },
  },
  {
    name: 'get_x_login_job',
    description: 'Poll a connect_x_account or reauth_x_account job. Returns status: queued|running|success|failed.',
    inputSchema: {
      type: 'object',
      properties: { job_id: { type: 'string' } },
      required: ['job_id'],
    },
  },
  {
    name: 'list_actions',
    description: 'List your actions filtered by type/status/account',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ACTION_TYPES },
        status: { type: 'string' },
        account_id: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['type'],
    },
  },
  {
    name: 'cancel_action',
    description: 'Cancel a pending action',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ACTION_TYPES },
        action_id: { type: 'string' },
      },
      required: ['type', 'action_id'],
    },
  },
  {
    name: 'replay_action',
    description: 'Replay a failed or dead action',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ACTION_TYPES },
        action_id: { type: 'string' },
      },
      required: ['type', 'action_id'],
    },
  },
  {
    name: 'get_settings',
    description: 'Get account-scoped settings',
    inputSchema: {
      type: 'object',
      properties: { account_id: { type: 'string' } },
      required: ['account_id'],
    },
  },
  {
    name: 'update_settings',
    description: 'Update account-scoped settings',
    inputSchema: {
      type: 'object',
      properties: {
        settings: { type: 'object' },
        account_id: { type: 'string' },
      },
      required: ['settings', 'account_id'],
    },
  },
] as const;

@Injectable()
export class McpService {
  private transports = new Map<string, SSEServerTransport>();
  private sessionUserMap = new Map<string, string>();

  constructor(
    private readonly adminApi: AdminApiService,
    private readonly accounts: AccountsService,
    private readonly settings: SettingsService,
    private readonly enqueue: ActionEnqueueService,
    private readonly dataSource: DataSource,
    private readonly xDirect: XDirectService,
    private readonly xBrowser: XBrowserService,
    private readonly monitoringService: MonitoringService,
    private readonly sessionRouter: McpSessionRouter,
    private readonly cipher: CredentialCipherService,
    private readonly loginJobs: LoginJobsRepository,
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
      const args = (req.params.arguments ?? {}) as Record<string, unknown>;
      return this.handleTool(userId, req.params.name, args);
    });

    return server;
  }

  private async handleTool(
    userId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
    try {
      const result = await this.dispatch_tool(userId, name, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  }

  private async dispatch_tool(
    userId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case 'post_tweet': {
        const text = args.text as string;
        if (!text) throw new Error('text is required');
        const accountId = await this.resolveAccountId(userId, args.account_id as string | undefined);
        return this.enqueue.enqueuePost({
          accountId, text, scheduledAt: new Date(), metadata: { source: 'mcp' },
        });
      }

      case 'reply_to_tweet': {
        const text = args.text as string;
        const parentTweetUrl = args.parent_tweet_url as string;
        if (!text) throw new Error('text is required');
        if (!parentTweetUrl?.includes('/status/')) throw new Error('parent_tweet_url must contain /status/');
        const accountId = await this.resolveAccountId(userId, args.account_id as string | undefined);
        return this.enqueue.enqueueReply({
          accountId, text, parentTweetUrl, scheduledAt: new Date(), metadata: { source: 'mcp' },
        });
      }

      case 'like_tweet': {
        const tweetUrl = args.tweet_url as string;
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        const accountId = await this.resolveAccountId(userId, args.account_id as string | undefined);
        return this.enqueue.enqueueLike({
          accountId, targetTweetUrl: tweetUrl, scheduledAt: new Date(), metadata: { source: 'mcp' },
        });
      }

      case 'retweet': {
        const tweetUrl = args.tweet_url as string;
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        const accountId = await this.resolveAccountId(userId, args.account_id as string | undefined);
        return this.enqueue.enqueueRetweet({
          accountId, targetTweetUrl: tweetUrl, scheduledAt: new Date(), metadata: { source: 'mcp' },
        });
      }

      case 'quote_tweet': {
        const text = args.text as string;
        const tweetUrl = args.tweet_url as string;
        if (!text) throw new Error('text is required');
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        const accountId = await this.resolveAccountId(userId, args.account_id as string | undefined);
        return this.enqueue.enqueueQuote({
          accountId, text, targetTweetUrl: tweetUrl, scheduledAt: new Date(), metadata: { source: 'mcp' },
        });
      }

      case 'bookmark_tweet': {
        const tweetUrl = args.tweet_url as string;
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        const accountId = await this.resolveAccountId(userId, args.account_id as string | undefined);
        return this.enqueue.enqueueBookmark({
          accountId, targetTweetUrl: tweetUrl, scheduledAt: new Date(), metadata: { source: 'mcp' },
        });
      }

      case 'follow_account': {
        const targetHandle = args.target_handle as string;
        if (!targetHandle) throw new Error('target_handle is required');
        const accountId = await this.resolveAccountId(userId, args.account_id as string | undefined);
        return this.enqueue.enqueueFollow({
          accountId, targetHandle, scheduledAt: new Date(), metadata: { source: 'mcp' },
        });
      }

      case 'post_thread': {
        const tweets = args.tweets as string[];
        if (!Array.isArray(tweets) || tweets.length === 0) throw new Error('tweets must be a non-empty array');
        const accountId = await this.resolveAccountId(userId, args.account_id as string | undefined);
        const results: Array<{ index: number; id: string | null }> = [];
        const now = new Date();
        for (let i = 0; i < tweets.length; i++) {
          const r = await this.enqueue.enqueuePost({
            accountId, text: tweets[i],
            scheduledAt: new Date(now.getTime() + i * 5000),
            metadata: { source: 'mcp-thread', threadIndex: i, threadLength: tweets.length },
          });
          results.push({ index: i, id: r.id });
        }
        return { enqueued: results.length, actions: results };
      }

      case 'unlike_tweet': {
        const tweetUrl = args.tweet_url as string;
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        const accountId = await this.resolveAccountId(userId, args.account_id as string | undefined);
        return this.xDirect.unlikeTweet(tweetUrl, accountId);
      }

      case 'unretweet': {
        const tweetUrl = args.tweet_url as string;
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        const accountId = await this.resolveAccountId(userId, args.account_id as string | undefined);
        return this.xDirect.unretweetTweet(tweetUrl, accountId);
      }

      case 'unfollow_account': {
        const targetHandle = args.target_handle as string;
        if (!targetHandle) throw new Error('target_handle is required');
        const accountId = await this.resolveAccountId(userId, args.account_id as string | undefined);
        return this.xDirect.unfollowAccount(targetHandle, accountId);
      }

      case 'delete_tweet': {
        const tweetUrl = args.tweet_url as string;
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        const accountId = await this.resolveAccountId(userId, args.account_id as string | undefined);
        return this.xDirect.deleteTweet(tweetUrl, accountId);
      }

      case 'send_dm': {
        const targetHandle = args.target_handle as string;
        const message = args.message as string;
        if (!targetHandle) throw new Error('target_handle is required');
        if (!message) throw new Error('message is required');
        const accountId = await this.resolveAccountId(userId, args.account_id as string | undefined);
        return this.xDirect.sendDm(targetHandle, message, accountId);
      }

      case 'update_profile': {
        const fields = {
          name: args.name as string | undefined,
          bio: args.bio as string | undefined,
          location: args.location as string | undefined,
          website: args.website as string | undefined,
        };
        if (!Object.values(fields).some(Boolean)) throw new Error('At least one of name, bio, location, website is required');
        const accountId = await this.resolveAccountId(userId, args.account_id as string | undefined);
        return this.xDirect.updateProfile(fields, accountId);
      }

      case 'search_tweets': {
        const query = args.query as string;
        if (!query) throw new Error('query is required');
        const limit = Math.min(Number(args.limit ?? 20), 50);
        const accountId = await this.resolveAccountIdOptional(userId, args.account_id as string | undefined);
        return this.xDirect.searchTweets(query, limit, accountId);
      }

      case 'get_user': {
        const handle = args.handle as string;
        if (!handle) throw new Error('handle is required');
        const accountId = await this.resolveAccountIdOptional(userId, args.account_id as string | undefined);
        return this.xDirect.getUser(handle, accountId);
      }

      case 'get_tweet': {
        const tweetUrl = args.tweet_url as string;
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        const accountId = await this.resolveAccountIdOptional(userId, args.account_id as string | undefined);
        return this.xDirect.getTweet(tweetUrl, accountId);
      }

      case 'get_user_tweets': {
        const handle = args.handle as string;
        if (!handle) throw new Error('handle is required');
        const limit = Math.min(Number(args.limit ?? 20), 50);
        const accountId = await this.resolveAccountIdOptional(userId, args.account_id as string | undefined);
        if (!accountId) return [];
        return this.xBrowser.readProfileTweets(handle, limit, accountId);
      }

      case 'search_users': {
        const query = args.query as string;
        if (!query) throw new Error('query is required');
        const limit = Math.min(Number(args.limit ?? 20), 50);
        const accountId = await this.resolveAccountIdOptional(userId, args.account_id as string | undefined);
        return this.xDirect.searchUsers(query, limit, accountId);
      }

      case 'get_user_followers': {
        const handle = args.handle as string;
        if (!handle) throw new Error('handle is required');
        const limit = Math.min(Number(args.limit ?? 50), 200);
        const accountId = await this.resolveAccountIdOptional(userId, args.account_id as string | undefined);
        return this.xDirect.getUserFollowers(handle, limit, accountId);
      }

      case 'get_x_trending': {
        const accountId = await this.resolveAccountIdOptional(userId, args.account_id as string | undefined);
        return this.xDirect.getXTrending(accountId);
      }

      case 'create_monitor': {
        const targetHandle = args.target_handle as string;
        const webhookUrl = args.webhook_url as string;
        if (!targetHandle) throw new Error('target_handle is required');
        if (!webhookUrl?.startsWith('http')) throw new Error('webhook_url must be a valid HTTP/HTTPS URL');
        const accountId = await this.resolveAccountId(userId, args.account_id as string | undefined);
        const monitor = await this.monitoringService.create({
          accountId, targetHandle, webhookUrl,
          eventTypes: (args.event_types as string[] | undefined) ?? ['tweet.new'],
        });
        return { ok: true, monitor };
      }

      case 'list_monitors': {
        const allowedIds = await this.userAccountIdSet(userId);
        const all = await this.monitoringService.listAll();
        const filtered = all.filter((m) => allowedIds.has(m.accountId));
        return { count: filtered.length, monitors: filtered };
      }

      case 'get_monitor': {
        const id = args.monitor_id as string;
        if (!id) throw new Error('monitor_id is required');
        const monitor = await this.monitoringService.findById(id);
        if (!monitor) throw new Error(`Monitor ${id} not found`);
        await this.assertAccountOwnership(userId, monitor.accountId);
        const deliveries = await this.monitoringService.listDeliveries(id, 10);
        return { monitor, recentDeliveries: deliveries };
      }

      case 'delete_monitor': {
        const id = args.monitor_id as string;
        if (!id) throw new Error('monitor_id is required');
        const monitor = await this.monitoringService.findById(id);
        if (!monitor) throw new Error(`Monitor ${id} not found`);
        await this.assertAccountOwnership(userId, monitor.accountId);
        const ok = await this.monitoringService.delete(id);
        if (!ok) throw new Error(`Monitor ${id} not found`);
        return { ok: true };
      }

      case 'pause_monitor': {
        const id = args.monitor_id as string;
        if (!id) throw new Error('monitor_id is required');
        const monitor = await this.monitoringService.findById(id);
        if (!monitor) throw new Error(`Monitor ${id} not found`);
        await this.assertAccountOwnership(userId, monitor.accountId);
        const ok = await this.monitoringService.disable(id);
        if (!ok) throw new Error(`Monitor ${id} not found`);
        return { ok: true, status: 'paused' };
      }

      case 'get_accounts': {
        const list = await this.accounts.listAllForUser(userId);
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

      case 'connect_x_account': {
        let username: string, email: string | null, password: string;
        let totpRaw: string | null;
        try {
          username = normalizeUsername(args.username);
          email = typeof args.email === 'string' && args.email.trim() ? args.email.trim() : null;
          password = requireString(args.password, 'password');
          const t = args.totp_secret;
          totpRaw = typeof t === 'string' && t.trim() ? t.trim() : null;
          if (totpRaw) assertBase32Secret(totpRaw, 'totp_secret');
        } catch (e) {
          if (e instanceof LoginValidationError) throw new Error(e.message);
          throw e;
        }
        await this.assertLoginCooldownIsClear(userId, username);
        const { id } = await this.loginJobs.create({
          userId,
          kind: 'connect',
          targetAccountId: null,
          username,
          email,
          encryptedPassword: this.cipher.encrypt(password),
          encryptedTotpSecret: totpRaw ? this.cipher.encrypt(totpRaw) : null,
          saveTotpSecret: Boolean(args.save_totp_secret),
          proxyCountry: null,
        });
        return {
          job_id: id,
          kind: 'connect',
          poll_with: { tool: 'get_x_login_job', args: { job_id: id } },
          hint: 'Poll every 2 seconds. Login typically completes in 20-40s.',
        };
      }

      case 'reauth_x_account': {
        const accountIdRaw = requireString(args.account_id, 'account_id');
        const accountId = accountIdRaw.trim().toLowerCase();
        const account = await this.accounts.findByIdForUser(accountId, userId);
        if (!account) throw new NotFoundException(`Account ${accountId} not found`);

        let password: string, totpRaw: string | null;
        try {
          password = requireString(args.password, 'password');
          const t = args.totp_secret;
          totpRaw = typeof t === 'string' && t.trim() ? t.trim() : null;
          if (totpRaw) assertBase32Secret(totpRaw, 'totp_secret');
        } catch (e) {
          if (e instanceof LoginValidationError) throw new Error(e.message);
          throw e;
        }
        const encryptedTotp = totpRaw
          ? this.cipher.encrypt(totpRaw)
          : account.totpSecretEncrypted;

        const emailArg = args.email;
        const email = typeof emailArg === 'string' && emailArg.trim() ? emailArg.trim() : null;

        await this.assertLoginCooldownIsClear(userId, account.id);

        const { id } = await this.loginJobs.create({
          userId,
          kind: 'reauth',
          targetAccountId: account.id,
          username: account.id,
          email,
          encryptedPassword: this.cipher.encrypt(password),
          encryptedTotpSecret: encryptedTotp,
          saveTotpSecret: Boolean(args.save_totp_secret) || (totpRaw === null && Boolean(account.totpSecretEncrypted)),
          proxyCountry: null,
        });
        return {
          job_id: id,
          kind: 'reauth',
          poll_with: { tool: 'get_x_login_job', args: { job_id: id } },
        };
      }

      case 'get_x_login_job': {
        const jobId = requireString(args.job_id, 'job_id');
        const job = await this.loginJobs.findByIdForUser(jobId, userId);
        if (!job) throw new NotFoundException(`Login job ${jobId} not found`);
        return {
          id: job.id,
          kind: job.kind,
          status: job.status,
          target_account_id: job.targetAccountId,
          failure_reason: job.failureReason,
          failure_detail: job.failureDetail,
          created_at: job.createdAt,
          started_at: job.startedAt,
          finished_at: job.finishedAt,
        };
      }

      case 'list_actions': {
        const type = args.type as ActionType;
        if (!ACTION_TYPES.includes(type)) throw new Error(`type must be one of: ${ACTION_TYPES.join(', ')}`);
        const limit = Math.min(Math.max(1, Number(args.limit ?? 50)), 200);
        const rawStatus = args.status as string | undefined;
        const status = rawStatus && ACTION_STATUSES.includes(rawStatus as ActionStatus)
          ? (rawStatus as ActionStatus)
          : undefined;
        const allowedIds = await this.userAccountIdSet(userId);
        if (allowedIds.size === 0) return { type, count: 0, rows: [] };

        const argAccountId = args.account_id as string | undefined;
        if (argAccountId && !allowedIds.has(argAccountId)) {
          throw new Error(`Account ${argAccountId} not found`);
        }
        const rows = await this.adminApi.listActions(type, status, argAccountId, limit);
        const filtered = argAccountId ? rows : rows.filter((r) => allowedIds.has(r.account_id));
        return { type, count: filtered.length, rows: filtered };
      }

      case 'cancel_action': {
        const type = args.type as ActionType;
        const id = args.action_id as string;
        if (!ACTION_TYPES.includes(type)) throw new Error(`Unknown action type: ${type}`);
        await this.assertActionOwnership(userId, type, id);
        const ok = await this.adminApi.cancelAction(type, id);
        if (!ok) throw new Error(`Action ${id} not found or not cancellable`);
        return { ok: true, id, status: 'cancelled' };
      }

      case 'replay_action': {
        const type = args.type as ActionType;
        const id = args.action_id as string;
        if (!ACTION_TYPES.includes(type)) throw new Error(`Unknown action type: ${type}`);
        await this.assertActionOwnership(userId, type, id);
        const ok = await this.adminApi.replayAction(type, id);
        if (!ok) throw new Error(`Action ${id} not found or not replayable`);
        return { ok: true, id, status: 'pending' };
      }

      case 'get_settings': {
        const accountId = args.account_id as string | undefined;
        if (!accountId) throw new Error('account_id is required');
        await this.assertAccountOwnership(userId, accountId);
        const defs = this.settings.getDefs();
        const entries = await Promise.all(
          defs.map(async (d) => [d.key, await this.settings.get(d.key, d.defaultValue, accountId)] as const),
        );
        return Object.fromEntries(entries);
      }

      case 'update_settings': {
        const accountId = args.account_id as string | undefined;
        if (!accountId) throw new Error('account_id is required');
        await this.assertAccountOwnership(userId, accountId);
        const settings = args.settings as Record<string, unknown>;
        if (!settings || typeof settings !== 'object') throw new Error('settings must be an object');
        const repo = this.dataSource.getRepository('settings');
        const now = new Date();
        for (const [key, value] of Object.entries(settings)) {
          const type = inferType(value);
          const raw = type === 'json' ? JSON.stringify(value) : String(value);
          await repo.upsert(
            { key, accountId, value: raw, type, updatedAt: now },
            ['key', 'accountId'],
          );
        }
        this.settings.invalidateCache();
        return { ok: true, updated: Object.keys(settings).length };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
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

function inferType(value: unknown): 'string' | 'number' | 'boolean' | 'json' {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'string';
}
