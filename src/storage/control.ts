import { config } from '../config';
import { getDb } from './db';
import { get } from './settings';
import { getDefaultAccountId } from './accounts';
import type { ControlState } from '../types';

const FIELDS = {
  paused: { key: 'paused', parse: (v: string | undefined) => v === 'true' },
  reason: { key: 'reason', parse: (v: string | undefined) => v ?? undefined },
  pausedAt: { key: 'pausedAt', parse: (v: string | undefined) => v ?? undefined },
  pauseUntil: { key: 'pauseUntil', parse: (v: string | undefined) => v ?? undefined },
  consecutiveFailures: { key: 'consecutiveFailures', parse: (v: string | undefined) => parseInt(v ?? '0', 10) },
  lastFailureAt: { key: 'lastFailureAt', parse: (v: string | undefined) => v ?? undefined },
  lastFailure: { key: 'lastFailure', parse: (v: string | undefined) => v ?? undefined },
  lastSuccessAt: { key: 'lastSuccessAt', parse: (v: string | undefined) => v ?? undefined },
} as const;

type FieldName = keyof typeof FIELDS;

function resolveAccountId(accountId?: string): string | null {
  return accountId ?? getDefaultAccountId();
}

function prefixFor(accountId?: string): string {
  const id = resolveAccountId(accountId);
  return id ? `${id}:` : '';
}

function prefixedKey(field: string, accountId?: string): string {
  return `${prefixFor(accountId)}${field}`;
}

function loadState(accountId?: string): ControlState {
  const db = getDb(config.paths.db);
  const prefix = prefixFor(accountId);

  const rows = db.prepare(
    "SELECT key, value FROM control_state WHERE key LIKE ? || '%'"
  ).all(prefix) as Array<{ key: string; value: string }>;

  const map = new Map<string, string>();
  const prefixLen = prefix.length;
  for (const row of rows) {
    map.set(row.key.slice(prefixLen), row.value);
  }

  const get = (field: FieldName): string | undefined => map.get(FIELDS[field].key);

  return {
    paused: FIELDS.paused.parse(get('paused')),
    reason: FIELDS.reason.parse(get('reason')),
    pausedAt: FIELDS.pausedAt.parse(get('pausedAt')),
    pauseUntil: FIELDS.pauseUntil.parse(get('pauseUntil')),
    consecutiveFailures: FIELDS.consecutiveFailures.parse(get('consecutiveFailures')),
    lastFailureAt: FIELDS.lastFailureAt.parse(get('lastFailureAt')),
    lastFailure: FIELDS.lastFailure.parse(get('lastFailure')),
    lastSuccessAt: FIELDS.lastSuccessAt.parse(get('lastSuccessAt')),
    updatedAt: get('lastSuccessAt') ?? new Date().toISOString(),
  };
}

function saveState(state: ControlState, accountId?: string): void {
  const db = getDb(config.paths.db);
  const updatedAt = new Date().toISOString();

  const entries: Array<[string, string]> = [
    ['paused', String(state.paused)],
    ['consecutiveFailures', String(state.consecutiveFailures)],
    ['updatedAt', updatedAt],
  ];

  const optional: Array<[FieldName, string | undefined]> = [
    ['reason', state.reason],
    ['pausedAt', state.pausedAt],
    ['pauseUntil', state.pauseUntil],
    ['lastFailureAt', state.lastFailureAt],
    ['lastFailure', state.lastFailure],
    ['lastSuccessAt', state.lastSuccessAt],
  ];

  for (const [field, value] of optional) {
    if (value != null) entries.push([FIELDS[field].key, value]);
  }

  const upsert = db.prepare(
    `INSERT INTO control_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );

  db.transaction(() => {
    for (const [key, value] of entries) {
      upsert.run(prefixedKey(key, accountId), value);
    }
  })();
}

export function load(accountId?: string): ControlState {
  return loadState(accountId);
}

export function save(state: ControlState, accountId?: string): void {
  saveState(state, accountId);
}

export function isPaused(accountId?: string, now: Date = new Date()): boolean {
  const state = loadState(accountId);
  if (!state.paused) return false;
  if (!state.pauseUntil) return true;
  if (new Date(state.pauseUntil) > now) return true;

  saveState({
    ...state,
    paused: false,
    reason: undefined,
    pausedAt: undefined,
    pauseUntil: undefined,
  }, accountId);
  return false;
}

export function recordSuccess(accountId?: string): void {
  saveState({
    ...loadState(accountId),
    paused: false,
    reason: undefined,
    pausedAt: undefined,
    pauseUntil: undefined,
    consecutiveFailures: 0,
    lastSuccessAt: new Date().toISOString(),
  }, accountId);
}

export function recordFailure(message: string, accountId?: string): ControlState {
  const state = loadState(accountId);
  const failures = state.consecutiveFailures + 1;
  const next: ControlState = {
    ...state,
    consecutiveFailures: failures,
    lastFailure: message,
    lastFailureAt: new Date().toISOString(),
  };

  const cbFailures = get<number>('circuit_breaker_failures', 3, accountId);
  const cbPauseMin = get<number>('circuit_breaker_pause_min', 60, accountId);

  if (failures >= cbFailures) {
    next.paused = true;
    next.reason = `circuit breaker: ${failures} consecutive failures`;
    next.pausedAt = new Date().toISOString();
    next.pauseUntil = new Date(Date.now() + cbPauseMin * 60 * 1000).toISOString();
  }

  saveState(next, accountId);
  return loadState(accountId);
}
