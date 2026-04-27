import fs from 'fs';
import path from 'path';
import { config } from '../config';
import type { ControlState } from '../types';

const FILE = config.paths.control;

function initialState(): ControlState {
  return {
    paused: false,
    consecutiveFailures: 0,
    updatedAt: new Date().toISOString(),
  };
}

function ensure(): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, JSON.stringify(initialState(), null, 2));
  }
}

export function load(): ControlState {
  ensure();
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw) as ControlState;
    if (!parsed || typeof parsed !== 'object') return initialState();
    return { ...initialState(), ...parsed };
  } catch {
    return initialState();
  }
}

export function save(state: ControlState): void {
  ensure();
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
  fs.renameSync(tmp, FILE);
}

export function isPaused(now: Date = new Date()): boolean {
  const state = load();
  if (!state.paused) return false;
  if (!state.pauseUntil) return true;
  if (new Date(state.pauseUntil) > now) return true;

  save({
    ...state,
    paused: false,
    reason: undefined,
    pausedAt: undefined,
    pauseUntil: undefined,
  });
  return false;
}

export function recordSuccess(): void {
  save({
    ...load(),
    paused: false,
    reason: undefined,
    pausedAt: undefined,
    pauseUntil: undefined,
    consecutiveFailures: 0,
    lastSuccessAt: new Date().toISOString(),
  });
}

export function recordFailure(message: string): ControlState {
  const state = load();
  const failures = state.consecutiveFailures + 1;
  const next: ControlState = {
    ...state,
    consecutiveFailures: failures,
    lastFailure: message,
    lastFailureAt: new Date().toISOString(),
  };

  if (failures >= config.pipeline.circuitBreakerFailures) {
    const pauseUntil = new Date(Date.now() + config.pipeline.circuitBreakerPauseMin * 60 * 1000).toISOString();
    next.paused = true;
    next.reason = `circuit breaker: ${failures} consecutive failures`;
    next.pausedAt = new Date().toISOString();
    next.pauseUntil = pauseUntil;
  }

  save(next);
  return load();
}
