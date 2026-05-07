type JsonObject = Record<string, unknown>;

interface RestSmokeResult {
  name: string;
  ok: boolean;
  skipped?: boolean;
  status?: number;
  durationMs: number;
  summary?: unknown;
  error?: string;
}

const baseUrl = env('TWEETLY_BASE_URL', 'http://localhost:3001').replace(/\/$/, '');
const apiKey = requiredEnv('TWEETLY_API_KEY');
const accountId = requiredEnv('TWEETLY_ACCOUNT_ID');
const targetHandle = env('TWEETLY_TARGET_HANDLE', accountId);
const targetTweetUrl = process.env.TWEETLY_TARGET_TWEET_URL;
const suite = env('TWEETLY_SMOKE_SUITE', argValue('--suite') ?? 'safe');
const allowWrites = process.env.TWEETLY_ALLOW_WRITE_SMOKE === 'true';

async function main(): Promise<void> {
  const results: RestSmokeResult[] = [];
  for (const test of selectedTests()) {
    results.push(await runTest(test.name, test.run));
  }

  const failed = results.filter((result) => !result.ok && !result.skipped);
  console.log(JSON.stringify({ ok: failed.length === 0, suite, baseUrl, results }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

function selectedTests(): Array<{ name: string; run: () => Promise<unknown> }> {
  const safe = [
    { name: 'GET /health', run: () => request('/health', { auth: false }) },
    { name: 'GET /auth/me', run: () => request('/auth/me') },
    { name: 'GET /api/v1/accounts', run: () => request('/api/v1/accounts') },
    { name: 'GET /api/v1/me/summary', run: () => request('/api/v1/me/summary') },
    { name: 'GET /api/v1/actions?type=post', run: () => request(`/api/v1/actions?type=post&account=${encodeURIComponent(accountId)}&limit=5`) },
  ];

  if (suite === 'safe') return safe;

  const read = [
    { name: 'GET /api/v1/x/users/:handle', run: () => request(`/api/v1/x/users/${encodeURIComponent(targetHandle)}?account=${encodeURIComponent(accountId)}`, { timeoutMs: 90_000 }) },
    { name: 'GET /api/v1/x/users/:handle/tweets', run: () => request(`/api/v1/x/users/${encodeURIComponent(targetHandle)}/tweets?limit=3&account=${encodeURIComponent(accountId)}`, { timeoutMs: 90_000 }) },
    { name: 'GET /api/v1/x/search/users', run: () => request(`/api/v1/x/search/users?query=${encodeURIComponent(targetHandle)}&limit=3&account=${encodeURIComponent(accountId)}`, { timeoutMs: 90_000 }) },
    { name: 'GET /api/v1/x/search/tweets', run: () => request(`/api/v1/x/search/tweets?query=${encodeURIComponent(`from:${targetHandle}`)}&limit=3&account=${encodeURIComponent(accountId)}`, { timeoutMs: 90_000 }) },
    { name: 'GET /api/v1/x/trending', run: () => request(`/api/v1/x/trending?account=${encodeURIComponent(accountId)}`, { timeoutMs: 90_000 }) },
    { name: 'GET /api/v1/x/users/:handle/followers', run: () => request(`/api/v1/x/users/${encodeURIComponent(targetHandle)}/followers?limit=5&account=${encodeURIComponent(accountId)}`, { timeoutMs: 90_000 }) },
    { name: 'POST /api/v1/x/tweets/get', run: () => requireTargetTweet(() => request('/api/v1/x/tweets/get', { method: 'POST', body: { tweetUrl: targetTweetUrl, account: accountId }, timeoutMs: 90_000 })) },
  ];

  if (suite === 'read') return [...safe, ...read];

  const write = [
    { name: 'POST /api/v1/actions/post', run: () => requireWrite(() => request('/api/v1/actions/post', { method: 'POST', body: { text: smokeText('post'), account: accountId } })) },
    { name: 'POST /api/v1/actions/like', run: () => requireWriteTarget(() => request('/api/v1/actions/like', { method: 'POST', body: { targetTweetUrl, account: accountId } })) },
    { name: 'POST /api/v1/actions/bookmark', run: () => requireWriteTarget(() => request('/api/v1/actions/bookmark', { method: 'POST', body: { targetTweetUrl, account: accountId } })) },
    { name: 'POST /api/v1/actions/reply', run: () => requireWriteTarget(() => request('/api/v1/actions/reply', { method: 'POST', body: { parentTweetUrl: targetTweetUrl, text: smokeText('reply'), account: accountId } })) },
    { name: 'POST /api/v1/actions/retweet', run: () => requireWriteTarget(() => request('/api/v1/actions/retweet', { method: 'POST', body: { targetTweetUrl, account: accountId } })) },
  ];

  if (suite === 'queue') return [...safe, ...write];

  return [...safe, ...read, ...write];
}

async function request(path: string, options: {
  method?: string;
  body?: JsonObject;
  auth?: boolean;
  timeoutMs?: number;
} = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  timeout.unref?.();

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.auth === false ? {} : { Authorization: `Bearer ${apiKey}` }),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = parseJsonText(text);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload).slice(0, 300)}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function runTest(name: string, run: () => Promise<unknown>): Promise<RestSmokeResult> {
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

function summarize(value: unknown): unknown {
  if (Array.isArray(value)) return { count: value.length, first: summarize(value[0]) };
  if (!value || typeof value !== 'object') return value;

  const object = value as JsonObject;
  return {
    ok: object.ok,
    count: object.count,
    id: object.id,
    status: object.status,
    queue: object.queue,
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

function smokeText(label: string): string {
  return `Tweetly REST smoke ${label} ${new Date().toISOString()}`;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
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
