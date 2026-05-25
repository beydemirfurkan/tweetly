#!/usr/bin/env node
// Wrapper around `typeorm migration:generate` that:
//   1. Builds the project so the compiled DataSource is up to date.
//   2. Resolves the output path (timestamp + Name) under src/persistence/migrations/.
//   3. Invokes typeorm with `-d dist/persistence/data-source.js`, the same
//      DataSource used by db:migrate / db:migrate:revert — no env-var
//      duplication, no manual --dataSource path.
//
// Usage:
//   npm --prefix backend run db:migrate:generate -- <Name>
//
// Example: npm --prefix backend run db:migrate:generate -- AddUserAvatarColumn
//   → backend/src/persistence/migrations/<timestamp>-AddUserAvatarColumn.ts

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

// First positional argument is the migration name. typeorm appends a
// timestamp prefix automatically, so we only forward the bare name.
const name = process.argv[2];
if (!name) {
  console.error('error: migration name is required.');
  console.error('usage:  npm --prefix backend run db:migrate:generate -- <Name>');
  process.exit(1);
}
if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
  console.error(
    `error: migration name must be PascalCase, got '${name}'. ` +
      'Example: AddUserAvatarColumn',
  );
  process.exit(1);
}

const migrationsDir = path.join(backendRoot, 'src', 'persistence', 'migrations');
const outputPath = path.join(migrationsDir, name);

// Step 1 — compile so dist/persistence/data-source.js is fresh. Pinning to
// the same `npm run build` the migrate script uses avoids drift if the
// build pipeline changes.
const build = spawnSync('npm', ['run', 'build', '--silent'], {
  cwd: backendRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

// Step 2 — invoke typeorm CLI. `-d` points at the compiled DataSource so
// typeorm can introspect the entities + the live DB exactly the way the
// migrate script does. We let typeorm pick the timestamp and produce a
// .ts file under the migrations dir.
const typeormBin = path.join(backendRoot, 'node_modules', '.bin', 'typeorm');
const dataSourcePath = path.join(backendRoot, 'dist', 'persistence', 'data-source.js');

const result = spawnSync(
  typeormBin,
  ['migration:generate', outputPath, '-d', dataSourcePath, '--pretty'],
  {
    cwd: backendRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);
process.exit(result.status ?? 1);
