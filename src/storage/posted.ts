import fs from 'fs';
import path from 'path';
import { config } from '../config';
import type { PostedState } from '../types';

const FILE = config.paths.posted;

function ensure(): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, JSON.stringify({ items: [] }, null, 2));
  }
}

export function load(): PostedState {
  ensure();
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw) as PostedState;
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    return parsed;
  } catch {
    return { items: [] };
  }
}

export function save(state: PostedState): void {
  ensure();
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

export function has(repoSlug: string): boolean {
  const slug = repoSlug.toLowerCase();
  return load().items.some((it) => it.repo.toLowerCase() === slug);
}

export function add(repoSlug: string): void {
  const state = load();
  if (!state.items.some((it) => it.repo.toLowerCase() === repoSlug.toLowerCase())) {
    state.items.push({ repo: repoSlug, postedAt: new Date().toISOString() });
    save(state);
  }
}
