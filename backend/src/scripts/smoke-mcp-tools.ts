type JsonObject = Record<string, unknown>;

interface SmokeResult {
  name: string;
  ok: boolean;
  skipped?: boolean;
  durationMs: number;
  summary?: unknown;
  error?: string;
}

interface SseEvent {
  event: string;
  data: string;
}

interface JsonRpcResponse {
  id?: number;
  result?: JsonObject;
  error?: { message?: string };
}

interface ToolCallResult {
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
}

const baseUrl = env('TWEETLY_BASE_URL', 'http://localhost:3001').replace(/\/$/, '');
const apiKey = requiredEnv('TWEETLY_API_KEY');
const accountId = env('TWEETLY_ACCOUNT_ID', 'test-account');
const targetHandle = env('TWEETLY_TARGET_HANDLE', accountId);
const targetTweetUrl = process.env.TWEETLY_TARGET_TWEET_URL;
const suite = env('TWEETLY_SMOKE_SUITE', argValue('--suite') ?? 'safe');
const allowWrites = process.env.TWEETLY_ALLOW_WRITE_SMOKE === 'true';
const allowDestructive = process.env.TWEETLY_ALLOW_DESTRUCTIVE_SMOKE === 'true';

class McpClient {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private buffer = '';
  private readonly decoder = new TextDecoder();
  private readonly queuedEvents: SseEvent[] = [];
  private readonly pendingEvents: SseEvent[] = [];
  private nextId = 1;
  private postUrl = '';
  private readonly controller = new AbortController();

  async connect(): Promise<void> {
    const response = await fetch(`${baseUrl}/mcp/sse`, {
      headers: this.authHeaders(),
      signal: this.controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`MCP SSE failed: ${response.status}`);
    }

    this.reader = response.body.getReader();
    const endpoint = await this.waitForEndpoint();
    this.postUrl = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'tweetly-mcp-smoke', version: '1.0.0' },
    }, 15_000);
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  }

  async close(): Promise<void> {
    if (this.reader) await this.reader.cancel().catch(() => undefined);
    this.controller.abort();
  }

  async listTools(): Promise<unknown> {
    return this.request('tools/list', {}, 15_000);
  }

  async callTool(name: string, args: JsonObject, timeoutMs = 60_000): Promise<unknown> {
    const result = await this.request('tools/call', { name, arguments: args }, timeoutMs) as ToolCallResult;
    const text = result.content?.[0]?.text ?? '';
    if (result.isError) throw new Error(text || `${name} returned isError=true`);
    return parseJsonText(text);
  }

  private async request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const id = this.nextId++;
    await this.post({ jsonrpc: '2.0', id, method, params });
    const response = await this.waitForResponse(id, timeoutMs);
    if (response.error) throw new Error(response.error.message ?? `${method} failed`);
    return response.result;
  }

  private async post(payload: unknown): Promise<void> {
    const response = await fetch(this.postUrl, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`MCP POST failed ${response.status}: ${text.slice(0, 300)}`);
    }
  }

  private async waitForEndpoint(): Promise<string> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const event = await this.nextEvent(deadline);
      if (event.event === 'endpoint') return event.data;
      this.pendingEvents.push(event);
    }
    throw new Error('MCP endpoint event timeout');
  }

  private async waitForResponse(id: number, timeoutMs: number): Promise<JsonRpcResponse> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const queuedIndex = this.pendingEvents.findIndex((event) => event.event === 'message' && eventMatchesId(event, id));
      if (queuedIndex !== -1) {
        const [event] = this.pendingEvents.splice(queuedIndex, 1);
        return JSON.parse(event.data) as JsonRpcResponse;
      }

      const event = await this.nextEvent(deadline);
      if (event.event !== 'message') {
        this.pendingEvents.push(event);
        continue;
      }

      const json = JSON.parse(event.data) as JsonRpcResponse;
      if (json.id === id) return json;
      this.pendingEvents.push(event);
    }
    throw new Error(`MCP response ${id} timeout`);
  }

  private async nextEvent(deadline: number): Promise<SseEvent> {
    if (!this.reader) throw new Error('MCP reader is not connected');

    while (Date.now() < deadline) {
      const queued = this.queuedEvents.shift();
      if (queued) return queued;

      const events = this.drainEvents();
      if (events.length > 0) {
        this.queuedEvents.push(...events);
        return this.queuedEvents.shift() as SseEvent;
      }

      const { value, done } = await this.reader.read();
      if (done) throw new Error('MCP SSE stream closed');
      this.buffer += this.decoder.decode(value, { stream: true });
    }
    throw new Error('MCP SSE event timeout');
  }

  private drainEvents(): SseEvent[] {
    const events: SseEvent[] = [];
    for (;;) {
      const index = this.buffer.indexOf('\n\n');
      if (index === -1) break;

      const raw = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 2);
      let event = 'message';
      const data: string[] = [];

      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) data.push(line.slice(5).trim());
      }
      events.push({ event, data: data.join('\n') });
    }
    return events;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` };
  }
}

async function main(): Promise<void> {
  const client = new McpClient();
  const results: SmokeResult[] = [];

  try {
    await client.connect();
    for (const test of selectedTests(client)) {
      results.push(await runTest(test.name, test.run));
    }
  } finally {
    await client.close();
  }

  const failed = results.filter((result) => !result.ok && !result.skipped);
  console.log(JSON.stringify({ ok: failed.length === 0, suite, baseUrl, results }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

function selectedTests(client: McpClient): Array<{ name: string; run: () => Promise<unknown> }> {
  const tests = [
    ...safeTests(client),
    ...(suite === 'read' || suite === 'all' ? readTests(client) : []),
    ...(suite === 'queue' || suite === 'all' ? queueTests(client) : []),
    ...(suite === 'destructive' || suite === 'all' ? destructiveTests(client) : []),
  ];
  return suite === 'safe' ? safeTests(client) : tests;
}

function safeTests(client: McpClient): Array<{ name: string; run: () => Promise<unknown> }> {
  return [
    { name: 'tools/list', run: () => client.listTools() },
    { name: 'get_accounts', run: () => client.callTool('get_accounts', {}) },
    { name: 'get_settings', run: () => client.callTool('get_settings', { account_id: accountId }) },
    { name: 'list_actions:post', run: () => client.callTool('list_actions', { type: 'post', account_id: accountId, limit: 5 }) },
    { name: 'list_monitors', run: () => client.callTool('list_monitors', {}) },
  ];
}

function readTests(client: McpClient): Array<{ name: string; run: () => Promise<unknown> }> {
  return [
    { name: 'get_user', run: () => client.callTool('get_user', { handle: targetHandle, account_id: accountId }, 90_000) },
    { name: 'get_user_tweets', run: () => client.callTool('get_user_tweets', { handle: targetHandle, limit: 3, account_id: accountId }, 90_000) },
    { name: 'search_users', run: () => client.callTool('search_users', { query: targetHandle, limit: 3, account_id: accountId }, 90_000) },
    { name: 'search_tweets', run: () => client.callTool('search_tweets', { query: `from:${targetHandle}`, limit: 3, account_id: accountId }, 90_000) },
    { name: 'get_x_trending', run: () => client.callTool('get_x_trending', { account_id: accountId }, 90_000) },
    { name: 'get_user_followers', run: () => client.callTool('get_user_followers', { handle: targetHandle, limit: 5, account_id: accountId }, 90_000) },
    { name: 'get_tweet', run: () => requireTargetTweet(() => client.callTool('get_tweet', { tweet_url: targetTweetUrl, account_id: accountId }, 90_000)) },
  ];
}

function queueTests(client: McpClient): Array<{ name: string; run: () => Promise<unknown> }> {
  return [
    { name: 'post_tweet', run: () => requireWrite(() => client.callTool('post_tweet', { text: smokeText('post'), account_id: accountId })) },
    { name: 'post_thread', run: () => requireWrite(() => client.callTool('post_thread', { tweets: [smokeText('thread 1'), smokeText('thread 2')], account_id: accountId })) },
    { name: 'like_tweet', run: () => requireWriteTarget(() => client.callTool('like_tweet', { tweet_url: targetTweetUrl, account_id: accountId })) },
    { name: 'bookmark_tweet', run: () => requireWriteTarget(() => client.callTool('bookmark_tweet', { tweet_url: targetTweetUrl, account_id: accountId })) },
    { name: 'retweet', run: () => requireWriteTarget(() => client.callTool('retweet', { tweet_url: targetTweetUrl, account_id: accountId })) },
    { name: 'reply_to_tweet', run: () => requireWriteTarget(() => client.callTool('reply_to_tweet', { parent_tweet_url: targetTweetUrl, text: smokeText('reply'), account_id: accountId })) },
    { name: 'quote_tweet', run: () => requireWriteTarget(() => client.callTool('quote_tweet', { tweet_url: targetTweetUrl, text: smokeText('quote'), account_id: accountId })) },
    { name: 'follow_account', run: () => requireWrite(() => client.callTool('follow_account', { target_handle: requiredSmokeEnv('TWEETLY_FOLLOW_TARGET_HANDLE'), account_id: accountId })) },
  ];
}

function destructiveTests(client: McpClient): Array<{ name: string; run: () => Promise<unknown> }> {
  return [
    { name: 'unlike_tweet', run: () => requireDestructiveTarget(() => client.callTool('unlike_tweet', { tweet_url: targetTweetUrl, account_id: accountId }, 90_000)) },
    { name: 'unretweet', run: () => requireDestructiveTarget(() => client.callTool('unretweet', { tweet_url: targetTweetUrl, account_id: accountId }, 90_000)) },
    { name: 'unfollow_account', run: () => requireDestructive(() => client.callTool('unfollow_account', { target_handle: requiredSmokeEnv('TWEETLY_FOLLOW_TARGET_HANDLE'), account_id: accountId }, 90_000)) },
    { name: 'send_dm', run: () => requireDestructive(() => client.callTool('send_dm', { target_handle: requiredSmokeEnv('TWEETLY_DM_TARGET_HANDLE'), message: smokeText('dm'), account_id: accountId }, 90_000)) },
    { name: 'update_profile', run: () => requireDestructive(() => client.callTool('update_profile', { bio: requiredSmokeEnv('TWEETLY_PROFILE_TEST_BIO'), account_id: accountId }, 90_000)) },
    { name: 'delete_tweet', run: () => requireDestructiveTarget(() => client.callTool('delete_tweet', { tweet_url: targetTweetUrl, account_id: accountId }, 90_000)) },
  ];
}

async function runTest(name: string, run: () => Promise<unknown>): Promise<SmokeResult> {
  const startedAt = Date.now();
  try {
    const summary = summarize(await run());
    return { name, ok: true, durationMs: Date.now() - startedAt, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('SKIP:')) {
      return { name, ok: true, skipped: true, durationMs: Date.now() - startedAt, error: message.slice(5).trim() };
    }
    return { name, ok: false, durationMs: Date.now() - startedAt, error: message };
  }
}

async function requireTargetTweet<T>(run: () => Promise<T>): Promise<T> {
  if (!targetTweetUrl) throw new Error('SKIP: TWEETLY_TARGET_TWEET_URL is required');
  return run();
}

async function requireWrite<T>(run: () => Promise<T>): Promise<T> {
  if (!allowWrites) throw new Error('SKIP: set TWEETLY_ALLOW_WRITE_SMOKE=true');
  return run();
}

async function requireWriteTarget<T>(run: () => Promise<T>): Promise<T> {
  await requireWrite(async () => undefined);
  return requireTargetTweet(run);
}

async function requireDestructive<T>(run: () => Promise<T>): Promise<T> {
  if (!allowDestructive) throw new Error('SKIP: set TWEETLY_ALLOW_DESTRUCTIVE_SMOKE=true');
  return run();
}

async function requireDestructiveTarget<T>(run: () => Promise<T>): Promise<T> {
  await requireDestructive(async () => undefined);
  return requireTargetTweet(run);
}

function summarize(value: unknown): unknown {
  if (Array.isArray(value)) return { count: value.length, first: summarize(value[0]) };
  if (!value || typeof value !== 'object') return value;

  const object = value as JsonObject;
  return {
    count: object.count,
    id: object.id,
    status: object.status,
    ok: object.ok,
    url: object.url,
    firstUrl: Array.isArray(object) ? undefined : (object.rows as Array<JsonObject> | undefined)?.[0]?.url,
    keys: Object.keys(object).slice(0, 10),
  };
}

function parseJsonText(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function eventMatchesId(event: SseEvent, id: number): boolean {
  try {
    return (JSON.parse(event.data) as JsonRpcResponse).id === id;
  } catch {
    return false;
  }
}

function smokeText(label: string): string {
  return `Tweetly local smoke ${label} ${new Date().toISOString()}`;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredSmokeEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`SKIP: ${name} is required`);
  return value;
}

function env(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
  process.exitCode = 1;
});

export {};
