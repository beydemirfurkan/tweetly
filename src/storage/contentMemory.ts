import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import type { ContentMemoryItem, ContentMemoryState } from '../types';

const FILE = config.paths.contentMemory;
const MAX_ITEMS = 500;
const SIMILARITY_THRESHOLD = 0.72;

function ensure(): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, JSON.stringify({ items: [] }, null, 2));
  }
}

export function load(): ContentMemoryState {
  ensure();
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw) as ContentMemoryState;
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    return parsed;
  } catch {
    return { items: [] };
  }
}

function save(state: ContentMemoryState): void {
  ensure();
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ items: state.items.slice(-MAX_ITEMS) }, null, 2));
  fs.renameSync(tmp, FILE);
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/repo:|github:|kaynak:/g, '')
    .replace(/[^a-z0-9ğüşöçıİ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function signature(text: string): string {
  return normalize(text).split(' ').slice(0, 14).join(' ');
}

function tokens(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(' ')
      .filter((word) => word.length > 3)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

export function similarityReason(text: string): string | null {
  const state = load();
  const normalized = normalize(text);
  const textHash = hash(normalized);
  const sig = signature(text);
  const textTokens = tokens(text);

  for (const item of state.items.slice(-150)) {
    if (item.textHash === textHash) return `exact hash match: ${item.repo}`;
    if (item.signature === sig) return `same opening signature: ${item.repo}`;
    if (jaccard(textTokens, tokens(item.text)) >= SIMILARITY_THRESHOLD) {
      return `high keyword overlap: ${item.repo}`;
    }
  }

  return null;
}

export function add(repo: string, text: string): void {
  const state = load();
  const normalized = normalize(text);
  const item: ContentMemoryItem = {
    repo,
    text,
    textHash: hash(normalized),
    signature: signature(text),
    createdAt: new Date().toISOString(),
  };
  state.items.push(item);
  save(state);
}

export function count(): number {
  return load().items.length;
}
