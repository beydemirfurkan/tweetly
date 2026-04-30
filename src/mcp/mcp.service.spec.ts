import { McpService } from './mcp.service';
import { mockMcpDeps } from '../test/mocks/mcp-deps.mock';

function createService() {
  const deps = mockMcpDeps();
  const service = new McpService(
    deps.adminApi as any,
    deps.accounts as any,
    deps.settings as any,
    deps.dispatch as any,
    deps.enqueue as any,
    deps.engagementConfig as any,
    deps.engagementCounter as any,
    deps.discoveryScheduler as any,
    deps.dataSource as any,
    deps.xDirect as any,
    deps.githubTrending as any,
    deps.externalTech as any,
    deps.monitoringService as any,
  );
  const call = (name: string, args: Record<string, unknown> = {}) =>
    (service as any).dispatch_tool(name, args);
  return { service, call, deps };
}

const TWEET_URL = 'https://x.com/user/status/123456789';

describe('McpService', () => {
  afterEach(() => jest.clearAllMocks());

  // ── Transport Map ────────────────────────────────────────────────────────

  describe('transport map', () => {
    it('set → get → delete works correctly', () => {
      const { service } = createService();
      const transport = { sessionId: 'sid-1' } as any;
      service.setTransport('sid-1', transport);
      expect(service.getTransport('sid-1')).toBe(transport);
      service.deleteTransport('sid-1');
      expect(service.getTransport('sid-1')).toBeUndefined();
    });

    it('returns undefined for unknown sessionId', () => {
      const { service } = createService();
      expect(service.getTransport('nonexistent')).toBeUndefined();
    });
  });

  // ── Error Handling ───────────────────────────────────────────────────────

  describe('unknown tool', () => {
    it('throws with tool name in message', async () => {
      const { call } = createService();
      await expect(call('does_not_exist')).rejects.toThrow('Unknown tool: does_not_exist');
    });
  });

  // ── Write Actions (queued) ────────────────────────────────────────────────

  describe('post_tweet', () => {
    it('calls enqueuePost with text and returns action id', async () => {
      const { call, deps } = createService();
      const result = await call('post_tweet', { text: 'Hello World' });
      expect(deps.enqueue.enqueuePost).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hello World' }));
      expect(result).toHaveProperty('id');
    });

    it('throws when text is missing', async () => {
      const { call } = createService();
      await expect(call('post_tweet', {})).rejects.toThrow('text is required');
    });
  });

  describe('reply_to_tweet', () => {
    it('calls enqueueReply with text and parent url', async () => {
      const { call, deps } = createService();
      await call('reply_to_tweet', { text: 'Reply', parent_tweet_url: TWEET_URL });
      expect(deps.enqueue.enqueueReply).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Reply', parentTweetUrl: TWEET_URL }),
      );
    });

    it('throws when parent_tweet_url does not contain /status/', async () => {
      const { call } = createService();
      await expect(call('reply_to_tweet', { text: 'hi', parent_tweet_url: 'https://x.com/user' }))
        .rejects.toThrow('parent_tweet_url must contain /status/');
    });
  });

  describe('like_tweet', () => {
    it('calls enqueueLike with targetTweetUrl', async () => {
      const { call, deps } = createService();
      await call('like_tweet', { tweet_url: TWEET_URL });
      expect(deps.enqueue.enqueueLike).toHaveBeenCalledWith(expect.objectContaining({ targetTweetUrl: TWEET_URL }));
    });

    it('throws for invalid tweet_url', async () => {
      const { call } = createService();
      await expect(call('like_tweet', { tweet_url: 'https://x.com/user' }))
        .rejects.toThrow('tweet_url must contain /status/');
    });
  });

  describe('retweet', () => {
    it('calls enqueueRetweet', async () => {
      const { call, deps } = createService();
      await call('retweet', { tweet_url: TWEET_URL });
      expect(deps.enqueue.enqueueRetweet).toHaveBeenCalled();
    });
  });

  describe('quote_tweet', () => {
    it('calls enqueueQuote with text and tweet_url', async () => {
      const { call, deps } = createService();
      await call('quote_tweet', { text: 'My comment', tweet_url: TWEET_URL });
      expect(deps.enqueue.enqueueQuote).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'My comment', targetTweetUrl: TWEET_URL }),
      );
    });
  });

  describe('bookmark_tweet', () => {
    it('calls enqueueBookmark', async () => {
      const { call, deps } = createService();
      await call('bookmark_tweet', { tweet_url: TWEET_URL });
      expect(deps.enqueue.enqueueBookmark).toHaveBeenCalled();
    });
  });

  describe('follow_account', () => {
    it('calls enqueueFollow with targetHandle', async () => {
      const { call, deps } = createService();
      await call('follow_account', { target_handle: 'someone' });
      expect(deps.enqueue.enqueueFollow).toHaveBeenCalledWith(
        expect.objectContaining({ targetHandle: 'someone' }),
      );
    });

    it('throws when target_handle is missing', async () => {
      const { call } = createService();
      await expect(call('follow_account', {})).rejects.toThrow('target_handle is required');
    });
  });

  describe('post_thread', () => {
    it('enqueues multiple posts and returns count', async () => {
      const { call, deps } = createService();
      const result: any = await call('post_thread', { tweets: ['Tweet 1', 'Tweet 2', 'Tweet 3'] });
      expect(deps.enqueue.enqueuePost).toHaveBeenCalledTimes(3);
      expect(result.enqueued).toBe(3);
      expect(result.actions).toHaveLength(3);
    });

    it('throws when tweets array is empty', async () => {
      const { call } = createService();
      await expect(call('post_thread', { tweets: [] })).rejects.toThrow('non-empty array');
    });

    it('staggers scheduledAt by 5s per tweet', async () => {
      const { call, deps } = createService();
      await call('post_thread', { tweets: ['A', 'B'] });
      const firstCall = deps.enqueue.enqueuePost.mock.calls[0][0];
      const secondCall = deps.enqueue.enqueuePost.mock.calls[1][0];
      const diff = secondCall.scheduledAt.getTime() - firstCall.scheduledAt.getTime();
      expect(diff).toBe(5000);
    });
  });

  // ── Undo Write Actions (direct) ──────────────────────────────────────────

  describe('unlike_tweet', () => {
    it('calls xDirect.unlikeTweet', async () => {
      const { call, deps } = createService();
      await call('unlike_tweet', { tweet_url: TWEET_URL });
      expect(deps.xDirect.unlikeTweet).toHaveBeenCalledWith(TWEET_URL, undefined);
    });

    it('throws for invalid tweet_url', async () => {
      const { call } = createService();
      await expect(call('unlike_tweet', { tweet_url: 'bad-url' })).rejects.toThrow('/status/');
    });
  });

  describe('unretweet', () => {
    it('calls xDirect.unretweetTweet', async () => {
      const { call, deps } = createService();
      await call('unretweet', { tweet_url: TWEET_URL });
      expect(deps.xDirect.unretweetTweet).toHaveBeenCalledWith(TWEET_URL, undefined);
    });
  });

  describe('unfollow_account', () => {
    it('calls xDirect.unfollowAccount', async () => {
      const { call, deps } = createService();
      await call('unfollow_account', { target_handle: 'someone' });
      expect(deps.xDirect.unfollowAccount).toHaveBeenCalledWith('someone', undefined);
    });

    it('throws when target_handle missing', async () => {
      const { call } = createService();
      await expect(call('unfollow_account', {})).rejects.toThrow('target_handle is required');
    });
  });

  describe('delete_tweet', () => {
    it('calls xDirect.deleteTweet', async () => {
      const { call, deps } = createService();
      await call('delete_tweet', { tweet_url: TWEET_URL });
      expect(deps.xDirect.deleteTweet).toHaveBeenCalledWith(TWEET_URL, undefined);
    });
  });

  describe('send_dm', () => {
    it('calls xDirect.sendDm with handle and message', async () => {
      const { call, deps } = createService();
      await call('send_dm', { target_handle: 'someone', message: 'Hi there' });
      expect(deps.xDirect.sendDm).toHaveBeenCalledWith('someone', 'Hi there', undefined);
    });

    it('throws when message is missing', async () => {
      const { call } = createService();
      await expect(call('send_dm', { target_handle: 'someone' })).rejects.toThrow('message is required');
    });
  });

  describe('update_profile', () => {
    it('calls xDirect.updateProfile with provided fields', async () => {
      const { call, deps } = createService();
      await call('update_profile', { name: 'New Name', bio: 'New bio' });
      expect(deps.xDirect.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Name', bio: 'New bio' }),
        undefined,
      );
    });

    it('throws when no fields provided', async () => {
      const { call } = createService();
      await expect(call('update_profile', {})).rejects.toThrow('At least one field');
    });
  });

  // ── Read Operations ───────────────────────────────────────────────────────

  describe('search_tweets', () => {
    it('calls xDirect.searchTweets with query', async () => {
      const { call, deps } = createService();
      await call('search_tweets', { query: 'AI trends' });
      expect(deps.xDirect.searchTweets).toHaveBeenCalledWith('AI trends', 20, undefined);
    });

    it('caps limit at 50', async () => {
      const { call, deps } = createService();
      await call('search_tweets', { query: 'test', limit: 100 });
      expect(deps.xDirect.searchTweets).toHaveBeenCalledWith('test', 50, undefined);
    });

    it('throws when query missing', async () => {
      const { call } = createService();
      await expect(call('search_tweets', {})).rejects.toThrow('query is required');
    });
  });

  describe('get_user', () => {
    it('calls xDirect.getUser with handle', async () => {
      const { call, deps } = createService();
      await call('get_user', { handle: 'testuser' });
      expect(deps.xDirect.getUser).toHaveBeenCalledWith('testuser', undefined);
    });
  });

  describe('get_tweet', () => {
    it('calls xDirect.getTweet with tweet url', async () => {
      const { call, deps } = createService();
      await call('get_tweet', { tweet_url: TWEET_URL });
      expect(deps.xDirect.getTweet).toHaveBeenCalledWith(TWEET_URL, undefined);
    });
  });

  describe('get_user_tweets', () => {
    it('calls xDirect.getUserTweets', async () => {
      const { call, deps } = createService();
      await call('get_user_tweets', { handle: 'testuser' });
      expect(deps.xDirect.getUserTweets).toHaveBeenCalledWith('testuser', 20, undefined);
    });
  });

  describe('search_users', () => {
    it('calls xDirect.searchUsers', async () => {
      const { call, deps } = createService();
      await call('search_users', { query: 'Alice' });
      expect(deps.xDirect.searchUsers).toHaveBeenCalledWith('Alice', 20, undefined);
    });
  });

  describe('get_user_followers', () => {
    it('calls xDirect.getUserFollowers with handle and limit', async () => {
      const { call, deps } = createService();
      await call('get_user_followers', { handle: 'testuser', limit: 30 });
      expect(deps.xDirect.getUserFollowers).toHaveBeenCalledWith('testuser', 30, undefined);
    });

    it('caps limit at 200', async () => {
      const { call, deps } = createService();
      await call('get_user_followers', { handle: 'testuser', limit: 999 });
      expect(deps.xDirect.getUserFollowers).toHaveBeenCalledWith('testuser', 200, undefined);
    });
  });

  describe('get_x_trending', () => {
    it('calls xDirect.getXTrending', async () => {
      const { call, deps } = createService();
      await call('get_x_trending', {});
      expect(deps.xDirect.getXTrending).toHaveBeenCalled();
    });
  });

  // ── Radar ─────────────────────────────────────────────────────────────────

  describe('get_radar', () => {
    it('calls githubTrending.fetchTrending for github source', async () => {
      const { call, deps } = createService();
      await call('get_radar', { sources: ['github'] });
      expect(deps.githubTrending.fetchTrending).toHaveBeenCalledWith(
        expect.objectContaining({ since: 'daily' }),
      );
    });

    it('calls externalTech.fetchCandidates for hackernews source', async () => {
      const { call, deps } = createService();
      await call('get_radar', { sources: ['hackernews'] });
      expect(deps.externalTech.fetchCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ includeHackerNews: true }),
      );
    });

    it('returns sources and results keys', async () => {
      const { call, deps } = createService();
      deps.githubTrending.fetchTrending.mockResolvedValue([{ name: 'repo1' }]);
      const result: any = await call('get_radar', { sources: ['github'] });
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('sources');
    });
  });

  // ── Monitoring ─────────────────────────────────────────────────────────────

  describe('create_monitor', () => {
    it('calls monitoringService.create with handle and webhook', async () => {
      const { call, deps } = createService();
      const result: any = await call('create_monitor', { target_handle: 'someuser', webhook_url: 'https://hook.test/cb' });
      expect(deps.monitoringService.create).toHaveBeenCalledWith(
        expect.objectContaining({ targetHandle: 'someuser', webhookUrl: 'https://hook.test/cb' }),
      );
      expect(result.ok).toBe(true);
    });

    it('throws when webhook_url is not http', async () => {
      const { call } = createService();
      await expect(call('create_monitor', { target_handle: 'user', webhook_url: 'ftp://bad' }))
        .rejects.toThrow('webhook_url must be a valid HTTP/HTTPS URL');
    });

    it('throws when target_handle missing', async () => {
      const { call } = createService();
      await expect(call('create_monitor', { webhook_url: 'https://hook.test' }))
        .rejects.toThrow('target_handle is required');
    });
  });

  describe('list_monitors', () => {
    it('returns count and monitors array', async () => {
      const { call, deps } = createService();
      deps.monitoringService.listAll.mockResolvedValue([{ id: 'mon-1' }, { id: 'mon-2' }]);
      const result: any = await call('list_monitors', {});
      expect(result.count).toBe(2);
      expect(result.monitors).toHaveLength(2);
    });
  });

  describe('get_monitor', () => {
    it('returns monitor and recent deliveries when found', async () => {
      const { call, deps } = createService();
      deps.monitoringService.findById.mockResolvedValue({ id: 'mon-1', targetHandle: 'user' });
      deps.monitoringService.listDeliveries.mockResolvedValue([]);

      const result: any = await call('get_monitor', { monitor_id: 'mon-1' });
      expect(result).toHaveProperty('monitor');
      expect(result).toHaveProperty('recentDeliveries');
    });

    it('throws when monitor not found', async () => {
      const { call } = createService();
      await expect(call('get_monitor', { monitor_id: 'nonexistent' }))
        .rejects.toThrow('not found');
    });
  });

  describe('delete_monitor', () => {
    it('returns ok:true when deleted', async () => {
      const { call, deps } = createService();
      deps.monitoringService.delete.mockResolvedValue(true);
      const result: any = await call('delete_monitor', { monitor_id: 'mon-1' });
      expect(result.ok).toBe(true);
    });

    it('throws when monitor not found', async () => {
      const { call, deps } = createService();
      deps.monitoringService.delete.mockResolvedValue(false);
      await expect(call('delete_monitor', { monitor_id: 'nonexistent' })).rejects.toThrow('not found');
    });
  });

  describe('pause_monitor', () => {
    it('returns ok:true and status:paused', async () => {
      const { call, deps } = createService();
      deps.monitoringService.disable.mockResolvedValue(true);
      const result: any = await call('pause_monitor', { monitor_id: 'mon-1' });
      expect(result.ok).toBe(true);
      expect(result.status).toBe('paused');
    });
  });

  // ── Admin ─────────────────────────────────────────────────────────────────

  describe('get_accounts', () => {
    it('calls accounts.listAll and returns count', async () => {
      const { call, deps } = createService();
      deps.accounts.listAll.mockResolvedValue([
        { id: 'acc-1', displayName: 'Test', status: 'active', authToken: 'tok', createdAt: new Date(), lastUsedAt: null },
      ]);
      const result: any = await call('get_accounts', {});
      expect(deps.accounts.listAll).toHaveBeenCalled();
      expect(result.count).toBe(1);
      expect(result.accounts[0]).toHaveProperty('id', 'acc-1');
    });
  });

  describe('get_status', () => {
    it('returns ok, queue, and analytics keys', async () => {
      const { call, deps } = createService();
      deps.adminApi.getQueueDepth.mockResolvedValue([{ pending: 0, dead: 0 }]);
      deps.adminApi.getFormatPerformanceLast7d.mockResolvedValue([]);
      const result: any = await call('get_status', {});
      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('queue');
      expect(result).toHaveProperty('analytics');
    });

    it('sets ok:false when dead actions exist', async () => {
      const { call, deps } = createService();
      deps.adminApi.getQueueDepth.mockResolvedValue([{ pending: 0, dead: 3 }]);
      deps.adminApi.getFormatPerformanceLast7d.mockResolvedValue([]);
      const result: any = await call('get_status', {});
      expect(result.ok).toBe(false);
    });
  });

  describe('get_queue_depth', () => {
    it('calls adminApi.getQueueDepth and returns result', async () => {
      const { call, deps } = createService();
      deps.adminApi.getQueueDepth.mockResolvedValue([{ type: 'post', pending: 5 }]);
      const result = await call('get_queue_depth', {});
      expect(result).toEqual([{ type: 'post', pending: 5 }]);
    });
  });

  describe('list_actions', () => {
    it('calls adminApi.listActions with type and limit', async () => {
      const { call, deps } = createService();
      deps.adminApi.listActions.mockResolvedValue([]);
      const result: any = await call('list_actions', { type: 'post', limit: 10 });
      expect(deps.adminApi.listActions).toHaveBeenCalledWith('post', undefined, undefined, 10);
      expect(result.type).toBe('post');
    });

    it('throws for invalid action type', async () => {
      const { call } = createService();
      await expect(call('list_actions', { type: 'invalid_type' })).rejects.toThrow('type must be one of');
    });
  });

  describe('cancel_action', () => {
    it('calls adminApi.cancelAction and returns ok', async () => {
      const { call, deps } = createService();
      deps.adminApi.cancelAction.mockResolvedValue(true);
      const result: any = await call('cancel_action', { type: 'post', action_id: 'uuid-1' });
      expect(deps.adminApi.cancelAction).toHaveBeenCalledWith('post', 'uuid-1');
      expect(result.ok).toBe(true);
    });

    it('throws when action not found', async () => {
      const { call, deps } = createService();
      deps.adminApi.cancelAction.mockResolvedValue(false);
      await expect(call('cancel_action', { type: 'post', action_id: 'bad' })).rejects.toThrow('not found or not cancellable');
    });
  });

  describe('replay_action', () => {
    it('calls adminApi.replayAction and returns ok', async () => {
      const { call, deps } = createService();
      deps.adminApi.replayAction.mockResolvedValue(true);
      const result: any = await call('replay_action', { type: 'post', action_id: 'uuid-1' });
      expect(result.ok).toBe(true);
    });
  });

  // ── Content / Workflows ───────────────────────────────────────────────────

  describe('trigger_content_collection', () => {
    it('calls dispatch.runAll when no account_id', async () => {
      const { call, deps } = createService();
      await call('trigger_content_collection', {});
      expect(deps.dispatch.runAll).toHaveBeenCalled();
      expect(deps.dispatch.runForAccount).not.toHaveBeenCalled();
    });

    it('calls dispatch.runForAccount when account_id provided', async () => {
      const { call, deps } = createService();
      await call('trigger_content_collection', { account_id: 'acc-1' });
      expect(deps.dispatch.runForAccount).toHaveBeenCalledWith('acc-1');
    });
  });

  // ── Settings ──────────────────────────────────────────────────────────────

  describe('get_settings', () => {
    it('returns settings object from getDefs and get', async () => {
      const { call, deps } = createService();
      deps.settings.getDefs.mockReturnValue([{ key: 'myKey', type: 'string', defaultValue: 'default' }]);
      deps.settings.get.mockResolvedValue('current-value');

      const result: any = await call('get_settings', {});
      expect(result).toHaveProperty('myKey', 'current-value');
    });
  });

  describe('get_setting_definitions', () => {
    it('returns array of setting definition objects', async () => {
      const { call, deps } = createService();
      deps.settings.getDefs.mockReturnValue([{ key: 'k1', type: 'number', defaultValue: 42 }]);

      const result: any = await call('get_setting_definitions', {});
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toEqual({ key: 'k1', type: 'number', defaultValue: 42 });
    });
  });

  describe('update_settings', () => {
    it('calls getRepository and upsert for each setting', async () => {
      const { call, deps } = createService();
      await call('update_settings', { settings: { myKey: 'newValue' } });

      expect(deps.dataSource.getRepository).toHaveBeenCalledWith('settings');
      expect(deps.settings.invalidateCache).toHaveBeenCalled();
    });

    it('throws when settings is not an object', async () => {
      const { call } = createService();
      await expect(call('update_settings', { settings: 'not-object' })).rejects.toThrow('settings must be an object');
    });
  });

  // ── Engagement ────────────────────────────────────────────────────────────

  describe('get_engagement_counters', () => {
    it('returns counts and limits for account', async () => {
      const { call } = createService();
      const result: any = await call('get_engagement_counters', { account_id: 'acc-1' });
      expect(result).toHaveProperty('counts');
      expect(result).toHaveProperty('limits');
      expect(result).toHaveProperty('date');
    });

    it('throws when account_id missing', async () => {
      const { call } = createService();
      await expect(call('get_engagement_counters', {})).rejects.toThrow('account_id is required');
    });
  });

  describe('get_engagement_config', () => {
    it('calls engagementConfig.get with account_id', async () => {
      const { call, deps } = createService();
      await call('get_engagement_config', { account_id: 'acc-1' });
      expect(deps.engagementConfig.get).toHaveBeenCalledWith('acc-1');
    });

    it('throws when account_id missing', async () => {
      const { call } = createService();
      await expect(call('get_engagement_config', {})).rejects.toThrow('account_id is required');
    });
  });

  describe('update_engagement_config', () => {
    it('calls engagementConfig.upsert with account_id and config', async () => {
      const { call, deps } = createService();
      await call('update_engagement_config', { account_id: 'acc-1', config: { maxLikesPerDay: 100 } });
      expect(deps.engagementConfig.upsert).toHaveBeenCalledWith('acc-1', expect.objectContaining({ maxLikesPerDay: 100 }));
    });
  });

  describe('trigger_timeline_discovery', () => {
    it('calls discoveryScheduler.runForAccount', async () => {
      const { call, deps } = createService();
      await call('trigger_timeline_discovery', { account_id: 'acc-1' });
      expect(deps.discoveryScheduler.runForAccount).toHaveBeenCalledWith('acc-1');
    });

    it('throws when account_id missing', async () => {
      const { call } = createService();
      await expect(call('trigger_timeline_discovery', {})).rejects.toThrow('account_id is required');
    });
  });

  describe('list_discovered_tweets', () => {
    it('calls dataSource.query with account_id and limit', async () => {
      const { call, deps } = createService();
      deps.dataSource.query.mockResolvedValue([]);
      await call('list_discovered_tweets', { account_id: 'acc-1', limit: 10 });
      expect(deps.dataSource.query).toHaveBeenCalledWith(expect.stringContaining('discovered_tweets'), ['acc-1', 10]);
    });

    it('throws when account_id missing', async () => {
      const { call } = createService();
      await expect(call('list_discovered_tweets', {})).rejects.toThrow('account_id is required');
    });
  });
});
