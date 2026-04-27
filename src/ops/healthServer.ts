import http, { type IncomingMessage, type ServerResponse } from 'http';
import { config } from '../config';
import * as queue from '../storage/queue';
import * as posted from '../storage/posted';
import * as runtime from './runtime';
import { make } from '../utils/logger';

const log = make('health');

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function isAuthorized(req: IncomingMessage): boolean {
  if (!config.server.adminToken) return false;
  const expected = `Bearer ${config.server.adminToken}`;
  return req.headers.authorization === expected || req.headers['x-admin-token'] === config.server.adminToken;
}

function healthPayload(): object {
  const queueSummary = queue.summary();
  const state = runtime.snapshot();

  return {
    ok: true,
    now: new Date().toISOString(),
    uptimeSec: state.uptimeSec,
    queue: {
      active: queueSummary.active,
      pending: queueSummary.counts.pending,
      failed: queueSummary.counts.failed,
      dead: queueSummary.counts.dead,
      nextScheduledAt: queueSummary.nextScheduledAt,
      nextDueAt: queueSummary.nextDueAt,
    },
    runtime: {
      collectRunning: state.collectRunning,
      lastSessionImport: state.lastSessionImport,
      lastDispatch: state.lastDispatch,
      lastCollect: state.lastCollect,
    },
  };
}

function statusPayload(): object {
  return {
    ...healthPayload(),
    paths: {
      data: config.paths.data,
      userData: config.paths.userData,
      queue: config.paths.queue,
      posted: config.paths.posted,
      logs: config.paths.logs,
      errors: config.paths.errors,
    },
    queue: queue.summary(),
    posted: {
      total: posted.load().items.length,
    },
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

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, healthPayload());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/status') {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' });
      return;
    }
    sendJson(res, 200, statusPayload());
    return;
  }

  sendJson(res, 404, { ok: false, error: 'not_found' });
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
