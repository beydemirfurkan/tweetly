import * as fs from 'fs';
import * as path from 'path';

const SINGLETON_FILES = ['SingletonCookie', 'SingletonLock', 'SingletonSocket'] as const;

export function clearStaleLocks(profileDir: string): void {
  fs.mkdirSync(profileDir, { recursive: true });
  for (const name of SINGLETON_FILES) {
    try {
      fs.rmSync(path.join(profileDir, name), { force: true, recursive: true });
    } catch {}
  }
}
