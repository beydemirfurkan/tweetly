#!/usr/bin/env node
// One-shot codemod: rewrite parent-relative imports (`../...`) to TS path aliases.
// Same-dir imports (`./foo`) are left alone. Quote style is preserved.
// Usage:
//   node scripts/codemod-paths.mjs           # apply
//   node scripts/codemod-paths.mjs --dry     # report only

import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const dryRun = process.argv.includes('--dry');

const srcRoot = path.resolve(cwd, 'src');
const extraRoots = [path.resolve(cwd, 'test')].filter((p) => fs.existsSync(p));

const SUBROOT_ALIASES = [
  ['domain', '@domain'],
  ['common', '@common'],
  ['persistence', '@persistence'],
];

function listTsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listTsFiles(full, out);
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function aliasFor(absTarget) {
  const rel = path.relative(srcRoot, absTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  for (const [sub, alias] of SUBROOT_ALIASES) {
    if (rel === sub || rel.startsWith(sub + path.sep)) {
      const inner = path.relative(path.join(srcRoot, sub), absTarget);
      return inner ? `${alias}/${inner.split(path.sep).join('/')}` : alias;
    }
  }
  return rel ? `@/${rel.split(path.sep).join('/')}` : '@';
}

// Matches:  from '../x'   from "../x"   import('../x')
const importRe = /(\bfrom\s+|\bimport\s*\(\s*)(['"])(\.\.[\/\\][^'"]+)\2/g;

const files = [...listTsFiles(srcRoot), ...extraRoots.flatMap((r) => listTsFiles(r))];

let touched = 0;
let edits = 0;
const sampleChanges = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  let fileEdits = 0;
  const next = content.replace(importRe, (m, kw, q, spec) => {
    const abs = path.resolve(dir, spec);
    const alias = aliasFor(abs);
    if (!alias) return m;
    fileEdits++;
    edits++;
    if (sampleChanges.length < 5) {
      sampleChanges.push(`${path.relative(cwd, file)}: ${spec} -> ${alias}`);
    }
    return `${kw}${q}${alias}${q}`;
  });
  if (next !== content) {
    touched++;
    if (!dryRun) fs.writeFileSync(file, next, 'utf8');
  }
}

console.log(`[codemod-paths] scanned ${files.length} .ts files`);
console.log(`[codemod-paths] ${touched} files ${dryRun ? 'would change' : 'changed'}, ${edits} specifiers rewritten`);
for (const c of sampleChanges) console.log(`  ${c}`);
if (dryRun) console.log('[codemod-paths] dry-run; no files written');
