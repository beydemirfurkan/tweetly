#!/usr/bin/env node
// Compares current circular deps against .madge-baseline.json.
// Fails if any *new* cycle appears (cycles being removed is fine and prompts a baseline refresh).
// Refresh after a faz lands:
//   npm run cycles:baseline

import fs from 'node:fs';
import path from 'node:path';
import madge from 'madge';

const baselinePath = path.resolve(process.cwd(), '.madge-baseline.json');
const updateBaseline = process.argv.includes('--update-baseline');

const result = await madge('src', {
  fileExtensions: ['ts'],
  tsConfig: 'tsconfig.json',
  detectiveOptions: { ts: { skipTypeImports: true } },
});

const cycles = result.circular();

// Each cycle is an array of files; canonicalise by rotating to start with the
// alphabetically smallest entry so two equivalent cycles serialise the same.
function canonicalise(cycle) {
  let minIdx = 0;
  for (let i = 1; i < cycle.length; i++) if (cycle[i] < cycle[minIdx]) minIdx = i;
  return [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
}
const serialise = (cycle) => canonicalise(cycle).join(' -> ');

const current = new Set(cycles.map(serialise));
const sortedCurrent = [...current].sort();

if (updateBaseline) {
  fs.writeFileSync(baselinePath, JSON.stringify(sortedCurrent, null, 2) + '\n');
  console.log(`[cycles] baseline written with ${sortedCurrent.length} cycle(s)`);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error('[cycles] no baseline at .madge-baseline.json — run: npm run cycles:baseline');
  process.exit(2);
}

const baseline = new Set(JSON.parse(fs.readFileSync(baselinePath, 'utf8')));
const added = [...current].filter((c) => !baseline.has(c));
const removed = [...baseline].filter((c) => !current.has(c));

console.log(`[cycles] current=${current.size}, baseline=${baseline.size}, added=${added.length}, removed=${removed.length}`);

if (added.length) {
  console.error('\n[cycles] NEW circular dependencies introduced:');
  for (const c of added) console.error('  + ' + c);
  console.error('\nFix the cycle, or — if intentional — refresh the baseline: npm run cycles:baseline');
  process.exit(1);
}

if (removed.length) {
  console.warn('\n[cycles] cycles disappeared since baseline (good!):');
  for (const c of removed) console.warn('  - ' + c);
  console.warn('\nRun: npm run cycles:baseline   to lock in the improvement.');
}

process.exit(0);
