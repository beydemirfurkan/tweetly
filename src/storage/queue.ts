import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';
import type { QueueItem, QueueState } from '../types';

const FILE = config.paths.queue;

function ensure(): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, JSON.stringify({ items: [] }, null, 2));
  }
}

export function load(): QueueState {
  ensure();
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw) as QueueState;
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    return parsed;
  } catch {
    return { items: [] };
  }
}

export function save(state: QueueState): void {
  ensure();
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

function newId(): string {
  return crypto.randomBytes(6).toString('hex');
}

export type EnqueueInput = Pick<QueueItem, 'repo' | 'url' | 'text' | 'scheduledAt'>;

export function enqueue(items: EnqueueInput[]): QueueItem[] {
  const state = load();
  const enriched: QueueItem[] = items.map((it) => ({
    id: newId(),
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
    ...it,
  }));
  state.items.push(...enriched);
  save(state);
  return enriched;
}

export function dueNext(now: Date = new Date()): QueueItem | null {
  const state = load();
  const dueItems = state.items
    .filter((it) => it.status === 'pending' && new Date(it.scheduledAt) <= now)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  return dueItems[0] ?? null;
}

export function update(id: string, patch: Partial<QueueItem>): QueueItem | null {
  const state = load();
  const idx = state.items.findIndex((it) => it.id === id);
  if (idx === -1) return null;
  state.items[idx] = { ...state.items[idx], ...patch } as QueueItem;
  save(state);
  return state.items[idx];
}

export function pendingRepoSlugs(): string[] {
  return load()
    .items.filter((it) => it.status === 'pending' || it.status === 'failed')
    .map((it) => it.repo.toLowerCase());
}
