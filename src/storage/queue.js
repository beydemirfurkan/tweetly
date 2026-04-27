const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../config');

const FILE = config.paths.queue;

function ensure() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, JSON.stringify({ items: [] }, null, 2));
  }
}

function load() {
  ensure();
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    return parsed;
  } catch {
    return { items: [] };
  }
}

function save(state) {
  ensure();
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

function enqueue(items) {
  const state = load();
  const enriched = items.map((it) => ({
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

function dueNext(now = new Date()) {
  const state = load();
  const dueItems = state.items
    .filter((it) => it.status === 'pending' && new Date(it.scheduledAt) <= now)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  return dueItems[0] || null;
}

function update(id, patch) {
  const state = load();
  const idx = state.items.findIndex((it) => it.id === id);
  if (idx === -1) return null;
  state.items[idx] = { ...state.items[idx], ...patch };
  save(state);
  return state.items[idx];
}

function pendingRepoSlugs() {
  return load()
    .items.filter((it) => it.status === 'pending' || it.status === 'failed')
    .map((it) => it.repo.toLowerCase());
}

module.exports = { load, save, enqueue, dueNext, update, pendingRepoSlugs };
