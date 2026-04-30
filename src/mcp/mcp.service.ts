import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Server } from '@modelcontextprotocol/sdk/server';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AccountsService } from '../accounts/accounts.service';
import { AdminApiService } from '../admin-api/admin-api.service';
import { SettingsService } from '../settings/settings.service';
import { WorkflowDispatchService } from '../workflows/workflow-dispatch.service';
import { ActionEnqueueService } from '../action-engine/action-enqueue.service';
import { EngagementConfigService } from '../engagement/engagement-config.service';
import { EngagementCounterService } from '../engagement/engagement-counter.service';
import { TimelineDiscoveryScheduler } from '../engagement/timeline-discovery-scheduler.service';
import type { ActionType, ActionStatus } from '../domain/types/action.types';
import { ACTION_TYPES, ACTION_STATUSES } from '../domain/types/action.types';
import { XDirectService } from '../x-automation/x-direct.service';
import { GithubTrendingSource } from '../trending-source/github-trending.source';
import { ExternalTechSource } from '../trending-source/external-tech.source';
import { MonitoringService } from '../monitoring/monitoring.service';

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
    description: 'Post multiple tweets as a thread (each tweet is enqueued sequentially)',
    inputSchema: {
      type: 'object',
      properties: {
        tweets: { type: 'array', items: { type: 'string' }, description: 'Array of tweet texts to post as a thread' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
      },
      required: ['tweets'],
    },
  },
  // ── Undo Write Actions (direct/synchronous) ───────────────────────────────
  {
    name: 'unlike_tweet',
    description: 'Remove a like from a tweet',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string', description: 'URL of the tweet to unlike (must contain /status/)' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
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
        tweet_url: { type: 'string', description: 'URL of the retweeted tweet (must contain /status/)' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
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
        target_handle: { type: 'string', description: 'Handle to unfollow (without @)' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
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
        tweet_url: { type: 'string', description: 'URL of the tweet to delete (must contain /status/)' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
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
        target_handle: { type: 'string', description: 'Recipient handle (without @)' },
        message: { type: 'string', description: 'Message text to send' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
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
        name: { type: 'string', description: 'Display name' },
        bio: { type: 'string', description: 'Profile bio/description' },
        location: { type: 'string', description: 'Location field' },
        website: { type: 'string', description: 'Website URL' },
        account_id: { type: 'string', description: 'Account ID (optional)' },
      },
    },
  },
  // ── Read Operations (synchronous via Patchright) ──────────────────────────
  {
    name: 'search_tweets',
    description: 'Search Twitter/X for tweets matching a query (returns live results)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (supports operators: from:handle, min_faves:N, lang:tr, etc.)' },
        limit: { type: 'number', description: 'Max results to return (default 20, max 50)' },
        account_id: { type: 'string', description: 'Account ID to use for browsing (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_user',
    description: 'Get a Twitter/X user profile (display name, bio, follower/following counts)',
    inputSchema: {
      type: 'object',
      properties: {
        handle: { type: 'string', description: 'Twitter handle to look up (without @)' },
        account_id: { type: 'string', description: 'Account ID to use for browsing (optional)' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'get_tweet',
    description: 'Get details of a specific tweet (text, stats, author)',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_url: { type: 'string', description: 'Full tweet URL (must contain /status/)' },
        account_id: { type: 'string', description: 'Account ID to use for browsing (optional)' },
      },
      required: ['tweet_url'],
    },
  },
  {
    name: 'get_user_tweets',
    description: "Get a user's recent tweets from their profile timeline",
    inputSchema: {
      type: 'object',
      properties: {
        handle: { type: 'string', description: 'Twitter handle (without @)' },
        limit: { type: 'number', description: 'Max tweets to return (default 20, max 50)' },
        account_id: { type: 'string', description: 'Account ID to use for browsing (optional)' },
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
        query: { type: 'string', description: 'Name or handle to search for' },
        limit: { type: 'number', description: 'Max results (default 20, max 50)' },
        account_id: { type: 'string', description: 'Account ID to use for browsing (optional)' },
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
        handle: { type: 'string', description: 'Twitter handle (without @)' },
        limit: { type: 'number', description: 'Max followers to return (default 50, max 200)' },
        account_id: { type: 'string', description: 'Account ID to use for browsing (optional)' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'get_x_trending',
    description: 'Get current trending topics on Twitter/X',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account ID to use for browsing (optional)' },
      },
    },
  },
  // ── Radar (multi-source trending) ─────────────────────────────────────────
  {
    name: 'get_radar',
    description: 'Get trending topics from multiple sources: GitHub Trending, Hacker News, dev.to',
    inputSchema: {
      type: 'object',
      properties: {
        sources: {
          type: 'array',
          items: { type: 'string', enum: ['github', 'hackernews', 'devto'] },
          description: 'Sources to include (default: all)',
        },
        github_since: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly'],
          description: 'GitHub trending period (default: daily)',
        },
        github_language: { type: 'string', description: 'Filter GitHub trending by programming language (optional)' },
        limit: { type: 'number', description: 'Max items per source (default 25)' },
      },
    },
  },
  // ── Monitoring ────────────────────────────────────────────────────────────
  {
    name: 'create_monitor',
    description: 'Monitor a Twitter/X account and receive webhook notifications when they post new tweets',
    inputSchema: {
      type: 'object',
      properties: {
        target_handle: { type: 'string', description: 'Handle to monitor (without @)' },
        webhook_url: { type: 'string', description: 'HTTPS URL to POST events to' },
        account_id: { type: 'string', description: 'Which of your accounts to use for checking (optional)' },
        event_types: {
          type: 'array',
          items: { type: 'string', enum: ['tweet.new'] },
          description: 'Event types to watch (default: [tweet.new])',
        },
      },
      required: ['target_handle', 'webhook_url'],
    },
  },
  {
    name: 'list_monitors',
    description: 'List all configured monitors with their status and last check time',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_monitor',
    description: 'Get details and recent webhook delivery history for a monitor',
    inputSchema: {
      type: 'object',
      properties: {
        monitor_id: { type: 'string', description: 'Monitor UUID' },
      },
      required: ['monitor_id'],
    },
  },
  {
    name: 'delete_monitor',
    description: 'Permanently delete a monitor',
    inputSchema: {
      type: 'object',
      properties: {
        monitor_id: { type: 'string', description: 'Monitor UUID' },
      },
      required: ['monitor_id'],
    },
  },
  {
    name: 'pause_monitor',
    description: 'Pause a monitor without deleting it (can be re-enabled by creating it again)',
    inputSchema: {
      type: 'object',
      properties: {
        monitor_id: { type: 'string', description: 'Monitor UUID' },
      },
      required: ['monitor_id'],
    },
  },
  {
    name: 'get_accounts',
    description: 'List all configured Twitter/X accounts',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_status',
    description: 'Get system status: queue depth, pending/dead actions, and last 7-day posting performance',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_queue_depth',
    description: 'Get pending and dead action counts per action type',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_actions',
    description: 'List actions filtered by type, status, account, and limit',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ACTION_TYPES, description: 'Action type' },
        status: { type: 'string', description: 'Filter by status (pending, running, succeeded, failed, dead, cancelled)' },
        account_id: { type: 'string', description: 'Filter by account ID (optional)' },
        limit: { type: 'number', description: 'Max results (1-200, default 50)' },
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
        type: { type: 'string', enum: ACTION_TYPES, description: 'Action type' },
        action_id: { type: 'string', description: 'Action UUID' },
      },
      required: ['type', 'action_id'],
    },
  },
  {
    name: 'replay_action',
    description: 'Replay a failed or dead action by re-enqueueing it as pending',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ACTION_TYPES, description: 'Action type' },
        action_id: { type: 'string', description: 'Action UUID' },
      },
      required: ['type', 'action_id'],
    },
  },
  {
    name: 'trigger_content_collection',
    description: 'Trigger the AI content collection workflow (GitHub trending → AI tweet generation)',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Run for specific account only (optional, runs all if omitted)' },
      },
    },
  },
  {
    name: 'get_settings',
    description: 'Get current settings (global or per-account)',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account ID for per-account settings (optional)' },
      },
    },
  },
  {
    name: 'get_setting_definitions',
    description: 'Get all available setting keys with their types and defaults',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'update_settings',
    description: 'Update one or more settings',
    inputSchema: {
      type: 'object',
      properties: {
        settings: { type: 'object', description: 'Key-value pairs of settings to update' },
        account_id: { type: 'string', description: 'Account ID for per-account settings (optional, updates global if omitted)' },
      },
      required: ['settings'],
    },
  },
  {
    name: 'get_engagement_counters',
    description: 'Get daily engagement counters (likes, retweets, quotes, bookmarks) for an account',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account ID' },
      },
      required: ['account_id'],
    },
  },
  {
    name: 'get_engagement_config',
    description: 'Get engagement configuration (daily limits) for an account',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account ID' },
      },
      required: ['account_id'],
    },
  },
  {
    name: 'update_engagement_config',
    description: 'Update engagement limits for an account',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account ID' },
        config: {
          type: 'object',
          description: 'Engagement config fields to update (maxLikesPerDay, maxRetweetsPerDay, maxQuotesPerDay, maxBookmarksPerDay)',
        },
      },
      required: ['account_id', 'config'],
    },
  },
  {
    name: 'trigger_timeline_discovery',
    description: 'Trigger timeline discovery to find tweets for engagement',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account ID' },
      },
      required: ['account_id'],
    },
  },
  {
    name: 'list_discovered_tweets',
    description: 'List tweets discovered via timeline for engagement',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account ID' },
        limit: { type: 'number', description: 'Max results (1-100, default 20)' },
      },
      required: ['account_id'],
    },
  },
] as const;

@Injectable()
export class McpService {
  private transports = new Map<string, SSEServerTransport>();

  constructor(
    private readonly adminApi: AdminApiService,
    private readonly accounts: AccountsService,
    private readonly settings: SettingsService,
    private readonly dispatch: WorkflowDispatchService,
    private readonly enqueue: ActionEnqueueService,
    private readonly engagementConfig: EngagementConfigService,
    private readonly engagementCounter: EngagementCounterService,
    private readonly discoveryScheduler: TimelineDiscoveryScheduler,
    private readonly dataSource: DataSource,
    private readonly xDirect: XDirectService,
    private readonly githubTrending: GithubTrendingSource,
    private readonly externalTech: ExternalTechSource,
    private readonly monitoringService: MonitoringService,
  ) {}

  getTransport(sessionId: string): SSEServerTransport | undefined {
    return this.transports.get(sessionId);
  }

  setTransport(sessionId: string, transport: SSEServerTransport): void {
    this.transports.set(sessionId, transport);
  }

  deleteTransport(sessionId: string): void {
    this.transports.delete(sessionId);
  }

  createServer(): Server {
    const server = new Server(
      { name: 'tweetly-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_DEFINITIONS,
    }));

    server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const args = (req.params.arguments ?? {}) as Record<string, unknown>;
      return this.handleTool(req.params.name, args);
    });

    return server;
  }

  private async handleTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      const result = await this.dispatch_tool(name, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error: ${message}` }] };
    }
  }

  private async dispatch_tool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const accountId = (args.account_id as string | undefined) ?? '';

    switch (name) {
      case 'post_tweet': {
        const text = args.text as string;
        if (!text) throw new Error('text is required');
        return this.enqueue.enqueuePost({
          accountId,
          text,
          scheduledAt: new Date(),
          metadata: { source: 'mcp' },
        });
      }

      case 'reply_to_tweet': {
        const text = args.text as string;
        const parentTweetUrl = args.parent_tweet_url as string;
        if (!text) throw new Error('text is required');
        if (!parentTweetUrl?.includes('/status/')) throw new Error('parent_tweet_url must contain /status/');
        return this.enqueue.enqueueReply({
          accountId,
          text,
          parentTweetUrl,
          scheduledAt: new Date(),
          metadata: { source: 'mcp' },
        });
      }

      case 'like_tweet': {
        const tweetUrl = args.tweet_url as string;
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        return this.enqueue.enqueueLike({
          accountId,
          targetTweetUrl: tweetUrl,
          scheduledAt: new Date(),
          metadata: { source: 'mcp' },
        });
      }

      case 'retweet': {
        const tweetUrl = args.tweet_url as string;
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        return this.enqueue.enqueueRetweet({
          accountId,
          targetTweetUrl: tweetUrl,
          scheduledAt: new Date(),
          metadata: { source: 'mcp' },
        });
      }

      case 'quote_tweet': {
        const text = args.text as string;
        const tweetUrl = args.tweet_url as string;
        if (!text) throw new Error('text is required');
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        return this.enqueue.enqueueQuote({
          accountId,
          text,
          targetTweetUrl: tweetUrl,
          scheduledAt: new Date(),
          metadata: { source: 'mcp' },
        });
      }

      case 'bookmark_tweet': {
        const tweetUrl = args.tweet_url as string;
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        return this.enqueue.enqueueBookmark({
          accountId,
          targetTweetUrl: tweetUrl,
          scheduledAt: new Date(),
          metadata: { source: 'mcp' },
        });
      }

      case 'follow_account': {
        const targetHandle = args.target_handle as string;
        if (!targetHandle) throw new Error('target_handle is required');
        return this.enqueue.enqueueFollow({
          accountId,
          targetHandle,
          scheduledAt: new Date(),
          metadata: { source: 'mcp' },
        });
      }

      case 'post_thread': {
        const tweets = args.tweets as string[];
        if (!Array.isArray(tweets) || tweets.length === 0) throw new Error('tweets must be a non-empty array');
        const results: Array<{ index: number; id: string | null }> = [];
        const now = new Date();
        for (let i = 0; i < tweets.length; i++) {
          const r = await this.enqueue.enqueuePost({
            accountId,
            text: tweets[i],
            scheduledAt: new Date(now.getTime() + i * 5000),
            metadata: { source: 'mcp-thread', threadIndex: i, threadLength: tweets.length },
          });
          results.push({ index: i, id: r.id });
        }
        return { enqueued: results.length, actions: results };
      }

      // ── Undo Write Actions (direct/synchronous via Patchright) ─────────────

      case 'unlike_tweet': {
        const tweetUrl = args.tweet_url as string;
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        return this.xDirect.unlikeTweet(tweetUrl, accountId || undefined);
      }

      case 'unretweet': {
        const tweetUrl = args.tweet_url as string;
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        return this.xDirect.unretweetTweet(tweetUrl, accountId || undefined);
      }

      case 'unfollow_account': {
        const targetHandle = args.target_handle as string;
        if (!targetHandle) throw new Error('target_handle is required');
        return this.xDirect.unfollowAccount(targetHandle, accountId || undefined);
      }

      case 'delete_tweet': {
        const tweetUrl = args.tweet_url as string;
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        return this.xDirect.deleteTweet(tweetUrl, accountId || undefined);
      }

      case 'send_dm': {
        const targetHandle = args.target_handle as string;
        const message = args.message as string;
        if (!targetHandle) throw new Error('target_handle is required');
        if (!message) throw new Error('message is required');
        return this.xDirect.sendDm(targetHandle, message, accountId || undefined);
      }

      case 'update_profile': {
        const fields = {
          name: args.name as string | undefined,
          bio: args.bio as string | undefined,
          location: args.location as string | undefined,
          website: args.website as string | undefined,
        };
        if (!Object.values(fields).some(Boolean)) throw new Error('At least one field (name, bio, location, website) is required');
        return this.xDirect.updateProfile(fields, accountId || undefined);
      }

      // ── Read Operations (synchronous via Patchright) ───────────────────────

      case 'search_tweets': {
        const query = args.query as string;
        if (!query) throw new Error('query is required');
        const limit = Math.min(Number(args.limit ?? 20), 50);
        return this.xDirect.searchTweets(query, limit, accountId || undefined);
      }

      case 'get_user': {
        const handle = args.handle as string;
        if (!handle) throw new Error('handle is required');
        return this.xDirect.getUser(handle, accountId || undefined);
      }

      case 'get_tweet': {
        const tweetUrl = args.tweet_url as string;
        if (!tweetUrl?.includes('/status/')) throw new Error('tweet_url must contain /status/');
        return this.xDirect.getTweet(tweetUrl, accountId || undefined);
      }

      case 'get_user_tweets': {
        const handle = args.handle as string;
        if (!handle) throw new Error('handle is required');
        const limit = Math.min(Number(args.limit ?? 20), 50);
        return this.xDirect.getUserTweets(handle, limit, accountId || undefined);
      }

      case 'search_users': {
        const query = args.query as string;
        if (!query) throw new Error('query is required');
        const limit = Math.min(Number(args.limit ?? 20), 50);
        return this.xDirect.searchUsers(query, limit, accountId || undefined);
      }

      case 'get_user_followers': {
        const handle = args.handle as string;
        if (!handle) throw new Error('handle is required');
        const limit = Math.min(Number(args.limit ?? 50), 200);
        return this.xDirect.getUserFollowers(handle, limit, accountId || undefined);
      }

      case 'get_x_trending': {
        return this.xDirect.getXTrending(accountId || undefined);
      }

      // ── Radar ─────────────────────────────────────────────────────────────

      case 'get_radar': {
        const sources = (args.sources as string[] | undefined) ?? ['github', 'hackernews', 'devto'];
        const limit = Number(args.limit ?? 25);
        const since = (args.github_since as 'daily' | 'weekly' | 'monthly' | undefined) ?? 'daily';
        const language = (args.github_language as string | undefined) ?? '';

        const results: Record<string, unknown[]> = {};

        const tasks = await Promise.allSettled([
          sources.includes('github')
            ? this.githubTrending.fetchTrending({ since, language }).then(r => { results.github = r.slice(0, limit); })
            : Promise.resolve(),
          sources.includes('hackernews') || sources.includes('devto')
            ? this.externalTech.fetchCandidates({
                includeHackerNews: sources.includes('hackernews'),
                includeDevTo: sources.includes('devto'),
                hackerNewsLimit: limit,
                devToLimit: limit,
              }).then(items => {
                if (sources.includes('hackernews')) {
                  results.hackernews = items.filter(i => i.sourceId === 'hacker_news').slice(0, limit);
                }
                if (sources.includes('devto')) {
                  results.devto = items.filter(i => i.sourceId === 'dev_to').slice(0, limit);
                }
              })
            : Promise.resolve(),
        ]);

        const errors = tasks
          .filter((t): t is PromiseRejectedResult => t.status === 'rejected')
          .map(t => t.reason instanceof Error ? t.reason.message : String(t.reason));

        return { sources: Object.keys(results), results, errors: errors.length ? errors : undefined };
      }

      // ── Monitoring ────────────────────────────────────────────────────────

      case 'create_monitor': {
        const targetHandle = args.target_handle as string;
        const webhookUrl = args.webhook_url as string;
        if (!targetHandle) throw new Error('target_handle is required');
        if (!webhookUrl) throw new Error('webhook_url is required');
        if (!webhookUrl.startsWith('http')) throw new Error('webhook_url must be a valid HTTP/HTTPS URL');

        const monitor = await this.monitoringService.create({
          accountId: accountId || (await this.accounts.listActive().then(a => a[0]?.id ?? '')),
          targetHandle,
          webhookUrl,
          eventTypes: (args.event_types as string[] | undefined) ?? ['tweet.new'],
        });
        return { ok: true, monitor };
      }

      case 'list_monitors': {
        const monitors = await this.monitoringService.listAll();
        return { count: monitors.length, monitors };
      }

      case 'get_monitor': {
        const id = args.monitor_id as string;
        if (!id) throw new Error('monitor_id is required');
        const monitor = await this.monitoringService.findById(id);
        if (!monitor) throw new Error(`Monitor ${id} not found`);
        const deliveries = await this.monitoringService.listDeliveries(id, 10);
        return { monitor, recentDeliveries: deliveries };
      }

      case 'delete_monitor': {
        const id = args.monitor_id as string;
        if (!id) throw new Error('monitor_id is required');
        const ok = await this.monitoringService.delete(id);
        if (!ok) throw new Error(`Monitor ${id} not found`);
        return { ok: true };
      }

      case 'pause_monitor': {
        const id = args.monitor_id as string;
        if (!id) throw new Error('monitor_id is required');
        const ok = await this.monitoringService.disable(id);
        if (!ok) throw new Error(`Monitor ${id} not found`);
        return { ok: true, status: 'paused' };
      }

      case 'get_accounts': {
        const list = await this.accounts.listAll();
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

      case 'get_status': {
        const [depth, perf] = await Promise.all([
          this.adminApi.getQueueDepth(),
          this.adminApi.getFormatPerformanceLast7d(),
        ]);
        const totalDead = depth.reduce((s: number, d: { dead: number }) => s + d.dead, 0);
        const totalPending = depth.reduce((s: number, d: { pending: number }) => s + d.pending, 0);
        return {
          ok: totalDead === 0,
          now: new Date().toISOString(),
          queue: { byType: depth, totalPending, totalDead },
          analytics: { last7dPosts: perf.reduce((s: number, f: { total: number }) => s + f.total, 0), formatPerformance: perf },
        };
      }

      case 'get_queue_depth':
        return this.adminApi.getQueueDepth();

      case 'list_actions': {
        const type = args.type as ActionType;
        if (!ACTION_TYPES.includes(type)) throw new Error(`type must be one of: ${ACTION_TYPES.join(', ')}`);
        const limit = Math.min(Math.max(1, Number(args.limit ?? 50)), 200);
        const rawStatus = args.status as string | undefined;
        const status = rawStatus && ACTION_STATUSES.includes(rawStatus as ActionStatus)
          ? (rawStatus as ActionStatus)
          : undefined;
        const rows = await this.adminApi.listActions(
          type,
          status,
          (args.account_id as string) || undefined,
          limit,
        );
        return { type, count: rows.length, rows };
      }

      case 'cancel_action': {
        const type = args.type as ActionType;
        const id = args.action_id as string;
        if (!ACTION_TYPES.includes(type)) throw new Error(`Unknown action type: ${type}`);
        const ok = await this.adminApi.cancelAction(type, id);
        if (!ok) throw new Error(`Action ${id} not found or not cancellable`);
        return { ok: true, id, status: 'cancelled' };
      }

      case 'replay_action': {
        const type = args.type as ActionType;
        const id = args.action_id as string;
        if (!ACTION_TYPES.includes(type)) throw new Error(`Unknown action type: ${type}`);
        const ok = await this.adminApi.replayAction(type, id);
        if (!ok) throw new Error(`Action ${id} not found or not in a replayable state`);
        return { ok: true, id, status: 'pending' };
      }

      case 'trigger_content_collection': {
        if (accountId) {
          await this.dispatch.runForAccount(accountId);
        } else {
          await this.dispatch.runAll();
        }
        return { ok: true };
      }

      case 'get_settings': {
        const defs = this.settings.getDefs();
        const entries = await Promise.all(
          defs.map(async (d) => [d.key, await this.settings.get(d.key, d.defaultValue, accountId || undefined)] as const),
        );
        return Object.fromEntries(entries);
      }

      case 'get_setting_definitions':
        return this.settings.getDefs().map((d) => ({ key: d.key, type: d.type, defaultValue: d.defaultValue }));

      case 'update_settings': {
        const settings = args.settings as Record<string, unknown>;
        if (!settings || typeof settings !== 'object') throw new Error('settings must be an object');
        const repo = this.dataSource.getRepository('settings');
        const now = new Date();
        const acctId = accountId || '';
        for (const [key, value] of Object.entries(settings)) {
          const type = inferType(value);
          const raw = type === 'json' ? JSON.stringify(value) : String(value);
          await repo.upsert({ key, accountId: acctId, value: raw, type, updatedAt: now }, ['key', 'accountId']);
        }
        this.settings.invalidateCache();
        return { ok: true, updated: Object.keys(settings).length };
      }

      case 'get_engagement_counters': {
        if (!accountId) throw new Error('account_id is required');
        const [counts, config] = await Promise.all([
          this.engagementCounter.getAllDailyCounts(accountId),
          this.engagementConfig.get(accountId),
        ]);
        return {
          date: new Date().toISOString().split('T')[0],
          counts,
          limits: {
            likes: config.maxLikesPerDay,
            retweets: config.maxRetweetsPerDay,
            quotes: config.maxQuotesPerDay,
            bookmarks: config.maxBookmarksPerDay,
          },
        };
      }

      case 'get_engagement_config': {
        if (!accountId) throw new Error('account_id is required');
        return this.engagementConfig.get(accountId);
      }

      case 'update_engagement_config': {
        if (!accountId) throw new Error('account_id is required');
        const config = args.config as Record<string, unknown>;
        if (!config || typeof config !== 'object') throw new Error('config must be an object');
        return this.engagementConfig.upsert(accountId, config as Parameters<typeof this.engagementConfig.upsert>[1]);
      }

      case 'trigger_timeline_discovery': {
        if (!accountId) throw new Error('account_id is required');
        await this.discoveryScheduler.runForAccount(accountId);
        return { ok: true };
      }

      case 'list_discovered_tweets': {
        if (!accountId) throw new Error('account_id is required');
        const n = Math.min(Number(args.limit ?? 20), 100);
        return this.dataSource.query(
          `SELECT tweet_url, author_handle, content_text, relevance_score, engagement_type, discovered_at
           FROM discovered_tweets WHERE account_id = $1 ORDER BY discovered_at DESC LIMIT $2`,
          [accountId, n],
        );
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}

function inferType(value: unknown): 'string' | 'number' | 'boolean' | 'json' {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'string';
}
