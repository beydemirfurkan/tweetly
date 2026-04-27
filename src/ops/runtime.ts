export interface RuntimeEvent {
  ok: boolean;
  at: string;
  message?: string;
}

export interface CollectEvent extends RuntimeEvent {
  reason: string;
  created: number;
}

export interface DispatchEvent extends RuntimeEvent {
  repo: string | null;
}

export interface RuntimeSnapshot {
  startedAt: string;
  uptimeSec: number;
  collectRunning: boolean;
  lastEmptyRefillAt: string | null;
  lastSessionImport: RuntimeEvent | null;
  lastCollect: CollectEvent | null;
  lastDispatch: DispatchEvent | null;
}

const startedAt = new Date();

let collectRunning = false;
let lastEmptyRefillAt: string | null = null;
let lastSessionImport: RuntimeEvent | null = null;
let lastCollect: CollectEvent | null = null;
let lastDispatch: DispatchEvent | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

export function setCollectRunning(value: boolean): void {
  collectRunning = value;
}

export function markEmptyRefillAttempt(): void {
  lastEmptyRefillAt = nowIso();
}

export function markSessionImport(event: Omit<RuntimeEvent, 'at'>): void {
  lastSessionImport = { ...event, at: nowIso() };
}

export function markCollect(event: Omit<CollectEvent, 'at'>): void {
  lastCollect = { ...event, at: nowIso() };
}

export function markDispatch(event: Omit<DispatchEvent, 'at'>): void {
  lastDispatch = { ...event, at: nowIso() };
}

export function snapshot(): RuntimeSnapshot {
  return {
    startedAt: startedAt.toISOString(),
    uptimeSec: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    collectRunning,
    lastEmptyRefillAt,
    lastSessionImport,
    lastCollect,
    lastDispatch,
  };
}
