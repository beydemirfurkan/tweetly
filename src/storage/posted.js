const fs = require('fs');
const path = require('path');
const { config } = require('../config');

const FILE = config.paths.posted;

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

function has(repoSlug) {
  const slug = repoSlug.toLowerCase();
  return load().items.some((it) => it.repo.toLowerCase() === slug);
}

function add(repoSlug) {
  const state = load();
  if (!state.items.some((it) => it.repo.toLowerCase() === repoSlug.toLowerCase())) {
    state.items.push({ repo: repoSlug, postedAt: new Date().toISOString() });
    save(state);
  }
}

module.exports = { load, save, has, add };
