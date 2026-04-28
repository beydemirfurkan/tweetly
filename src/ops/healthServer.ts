import http, { type IncomingMessage, type ServerResponse } from 'http';
import { config } from '../config';
import * as queue from '../storage/queue';
import * as posted from '../storage/posted';
import * as control from '../storage/control';
import * as contentMemory from '../storage/contentMemory';
import * as analytics from '../storage/analytics';
import * as settings from '../storage/settings';
import * as accounts from '../storage/accounts';
import * as runtime from './runtime';
import { make } from '../utils/logger';

const log = make('health');

export interface TriggerCallbacks {
  collect: () => Promise<void>;
  dispatch: () => Promise<void>;
}

let _triggers: TriggerCallbacks = { collect: () => Promise.resolve(), dispatch: () => Promise.resolve() };

export function setTriggers(cb: TriggerCallbacks): void {
  _triggers = cb;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body, null, 2));
}

function unauthorized(res: ServerResponse): void {
  sendJson(res, 401, { ok: false, error: 'unauthorized' });
}

function isAuthorized(req: IncomingMessage): boolean {
  if (!config.server.adminToken) return false;
  const bearer = `Bearer ${config.server.adminToken}`;
  return req.headers.authorization === bearer || req.headers['x-admin-token'] === config.server.adminToken;
}

type Handler = (req: IncomingMessage, res: ServerResponse, url: URL) => void | Promise<void>;
const MAX_BODY_BYTES = 64 * 1024;

function auth(fn: Handler): Handler {
  return (req, res, url) => {
    if (!isAuthorized(req)) return unauthorized(res);
    return fn(req, res, url);
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk: Buffer | string) => {
      const chunkSize = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      size += chunkSize;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function bestAndWorst(perf: analytics.FormatStats[]): { best: analytics.FormatStats | null; worst: analytics.FormatStats | null } {
  if (perf.length === 0) return { best: null, worst: null };
  const sorted = [...perf].sort((a, b) => b.successRate - a.successRate);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

function healthPayload(): object {
  const qs = queue.summary();
  const rt = runtime.snapshot();
  const ctrl = control.load();
  const perf = analytics.getFormatPerformance(daysAgo(7));
  const { best, worst } = bestAndWorst(perf);

  return {
    ok: !control.isPaused() && qs.counts.dead === 0,
    now: new Date().toISOString(),
    uptimeSec: rt.uptimeSec,
    control: {
      paused: ctrl.paused,
      reason: ctrl.reason ?? null,
      pauseUntil: ctrl.pauseUntil ?? null,
      consecutiveFailures: ctrl.consecutiveFailures,
    },
    queue: {
      active: qs.active,
      pending: qs.counts.pending,
      failed: qs.counts.failed,
      dead: qs.counts.dead,
      nextScheduledAt: qs.nextScheduledAt,
      nextDueAt: qs.nextDueAt,
    },
    analytics: {
      last7dPosts: perf.reduce((sum, f) => sum + f.total, 0),
      bestFormat: best ? { format: best.format, successRate: best.successRate } : null,
      worstFormat: worst ? { format: worst.format, successRate: worst.successRate } : null,
      formatPerformance: perf,
    },
    runtime: {
      collectRunning: rt.collectRunning,
      lastSessionImport: rt.lastSessionImport,
      lastDispatch: rt.lastDispatch,
      lastCollect: rt.lastCollect,
    },
  };
}

function statusPayload(): object {
  return {
    ...healthPayload(),
    paths: config.paths,
    queue: queue.summary(),
    posted: { total: posted.total() },
    contentMemory: { total: contentMemory.count() },
    config: {
      tweetsPerDay: config.pipeline.tweetsPerDay,
      dispatchStartHour: config.pipeline.dispatchStartHour,
      dispatchIntervalMin: config.pipeline.dispatchIntervalMin,
      maxAttempts: config.pipeline.maxAttempts,
      hasAdminToken: Boolean(config.server.adminToken),
      hasOpenRouterKey: Boolean(config.openrouter.apiKey),
      hasSessionToken: Boolean(process.env.X_AUTH_TOKEN),
      headless: config.x.headless,
    },
  };
}

function accountsPayload(): object {
  const active = accounts.getActive();
  const all = accounts.list();

  const perAccount = active.map((account) => {
    const qs = queue.summary(account.id);
    const ctrl = control.load(account.id);
    const perf = analytics.getFormatPerformance(daysAgo(7), account.id);

    return {
      id: account.id,
      displayName: account.displayName,
      status: account.status,
      lastUsedAt: account.lastUsedAt,
      queue: {
        active: qs.active,
        pending: qs.counts.pending,
        failed: qs.counts.failed,
        dead: qs.counts.dead,
      },
      control: {
        paused: ctrl.paused,
        consecutiveFailures: ctrl.consecutiveFailures,
      },
      postsLast7d: perf.reduce((sum, f) => sum + f.total, 0),
      postedTotal: posted.total(account.id),
    };
  });

  return { total: all.length, active: active.length, accounts: perAccount };
}

function accountDetailPayload(accountId: string): object | null {
  const account = accounts.getById(accountId);
  if (!account) return null;

  const qs = queue.summary(account.id);
  const ctrl = control.load(account.id);
  const perf = analytics.getFormatPerformance(daysAgo(7), account.id);

  return {
    id: account.id,
    displayName: account.displayName,
    status: account.status,
    createdAt: account.createdAt,
    lastUsedAt: account.lastUsedAt,
    queue: qs,
    control: ctrl,
    analytics: {
      postsLast7d: perf.reduce((sum, f) => sum + f.total, 0),
      formatPerformance: perf,
    },
    posted: { total: posted.total(account.id), repos: posted.allRepos(account.id).slice(0, 20) },
    contentMemory: { total: contentMemory.count(account.id) },
  };
}

interface Route {
  method: string;
  pattern: string | RegExp;
  handler: Handler;
}

const GET = 'GET';
const PUT = 'PUT';
const POST = 'POST';

const routes: Route[] = [
  { method: GET, pattern: '/health', handler: (_req, res) => sendJson(res, 200, healthPayload()) },
  { method: GET, pattern: '/status', handler: auth((_req, res) => sendJson(res, 200, statusPayload())) },
  { method: GET, pattern: '/accounts', handler: auth((_req, res) => sendJson(res, 200, accountsPayload())) },
  {
    method: GET,
    pattern: /^\/accounts\/(.+)$/,
    handler: auth((_req, res, url) => {
      const match = url.pathname.match(/^\/accounts\/(.+)$/);
      const accountId = decodeURIComponent(match![1]);
      const detail = accountDetailPayload(accountId);
      sendJson(res, detail ? 200 : 404, detail ?? { ok: false, error: 'account not found' });
    }),
  },
  {
    method: GET,
    pattern: '/settings',
    handler: auth((_req, res, url) => {
      const acctId = url.searchParams.get('account') ?? undefined;
      sendJson(res, 200, settings.getAll(acctId));
    }),
  },
  {
    method: PUT,
    pattern: '/settings',
    handler: auth(async (req, res) => {
      const body = await readBody(req);
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        const accountId = (parsed._accountId as string) ?? undefined;
        const keys = Object.keys(parsed).filter((k) => k !== '_accountId');
        const invalidKeys = keys.filter((key) => !settings.isKnownSetting(key));
        if (invalidKeys.length > 0) {
          sendJson(res, 400, { ok: false, error: `unknown setting keys: ${invalidKeys.join(', ')}` });
          return;
        }
        for (const key of keys) {
          settings.set(key, parsed[key], accountId);
        }
        sendJson(res, 200, { ok: true, updated: keys.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJson(res, 400, { ok: false, error: msg === 'body too large' ? msg : 'invalid json' });
      }
    }),
  },
  {
    method: POST,
    pattern: '/collect',
    handler: auth(async (_req, res) => {
      try {
        await _triggers.collect();
        sendJson(res, 200, { ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJson(res, 500, { ok: false, error: msg });
      }
    }),
  },
  {
    method: POST,
    pattern: '/dispatch',
    handler: auth(async (_req, res) => {
      try {
        await _triggers.dispatch();
        sendJson(res, 200, { ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJson(res, 500, { ok: false, error: msg });
      }
    }),
  },
];

function matchRoute(method: string, pathname: string): Route | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    if (typeof route.pattern === 'string' && route.pattern === pathname) return route;
    if (route.pattern instanceof RegExp && route.pattern.test(pathname)) return route;
  }
  return null;
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const route = matchRoute(req.method ?? 'GET', url.pathname);

  if (route) {
    Promise.resolve(route.handler(req, res, url)).catch((err) => {
      log.error(`Health route hata: ${err instanceof Error ? err.message : String(err)}`);
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: 'internal_error' });
      } else if (!res.writableEnded) {
        res.end();
      }
    });
  } else {
    sendJson(res, 404, { ok: false, error: 'not_found' });
  }
}

export function startHealthServer(): http.Server {
  const server = http.createServer(handle);
  server.listen(config.server.port, () => {
    log.ok(`Health server ${config.server.port} portunda hazır.`);
  });
  server.on('error', (err) => {
    log.error(`Health server hata: ${err instanceof Error ? err.message : String(err)}`);
  });
  return server;
}
