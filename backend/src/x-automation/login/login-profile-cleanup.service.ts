import * as fs from 'fs/promises';
import * as path from 'path';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

const RETENTION_DAYS = parseInt(process.env.LOGIN_PROFILE_RETENTION_DAYS ?? '7', 10);
const SWEEP_INTERVAL_MS = parseInt(
  process.env.LOGIN_PROFILE_CLEANUP_INTERVAL_MS ?? `${6 * 60 * 60 * 1000}`,
  10,
);
const DATA_ROOT = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
const PROFILES_DIR = path.join(DATA_ROOT, 'user-data');
const DEBUG_ARTIFACTS_DIR = path.join(DATA_ROOT, 'errors', 'login');

/**
 * Periodic disk-retention task for the login module.
 *
 * Two unbounded growth surfaces motivate this service:
 *
 *  1. `${DATA_ROOT}/user-data/login-*` — `resolveLoginProfileDir` creates
 *     a fresh per-username × per-proxy persistent context for every
 *     connect attempt. Failed connects (wrong password, bot user spam,
 *     captcha) write GB-scale browser state and never clean up.
 *
 *  2. `${DATA_ROOT}/errors/login/*.json` — `login-debug-artifact` writes
 *     a JSON per failure with no rotation.
 *
 * `reauth` profiles (account-keyed dirs without the `login-` prefix) are
 * bounded by the active-account set, so we leave them alone — deleting
 * them by mtime risks evicting a long-idle but legitimate session.
 *
 * Retention is mtime-based for simplicity; a stale dir has a stale
 * mtime. Cross-referencing `login_jobs.finished_at` is a future refinement
 * if mtime ever proves too aggressive in practice.
 */
@Injectable()
export class LoginProfileCleanupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(LoginProfileCleanupService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.LOGIN_PROFILE_CLEANUP_DISABLED === 'true') {
      this.log.log('LoginProfileCleanupService disabled via env');
      return;
    }
    this.log.log(
      `LoginProfileCleanupService enabled: retention=${RETENTION_DAYS}d, interval=${Math.round(SWEEP_INTERVAL_MS / 1000)}s`,
    );
    // Run once on boot so a long-running prior instance's accumulated
    // profiles get a sweep before the next disk-pressure event.
    this.sweep().catch((err) => this.log.warn(`bootstrap sweep failed: ${asString(err)}`));
    this.timer = setInterval(
      () => this.sweep().catch((err) => this.log.warn(`scheduled sweep failed: ${asString(err)}`)),
      SWEEP_INTERVAL_MS,
    );
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Public for tests and manual invocation. Returns the count of
   * profiles + artifacts removed so a caller can log or assert.
   */
  async sweep(): Promise<{ profiles: number; artifacts: number }> {
    const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const profiles = await this.sweepProfiles(cutoffMs);
    const artifacts = await this.sweepDebugArtifacts(cutoffMs);
    if (profiles > 0 || artifacts > 0) {
      this.log.log(`sweep: profiles=${profiles} artifacts=${artifacts}`);
    }
    return { profiles, artifacts };
  }

  private async sweepProfiles(cutoffMs: number): Promise<number> {
    const entries = await fs.readdir(PROFILES_DIR, { withFileTypes: true }).catch(() => null);
    if (!entries) return 0;

    let removed = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Only sweep `login-*` connect-flow staging dirs. Reauth profiles
      // are account-keyed (no prefix) and bounded by the user's account
      // count — touching them risks evicting a live session.
      if (!entry.name.startsWith('login-')) continue;

      const dirPath = path.join(PROFILES_DIR, entry.name);
      const stat = await fs.stat(dirPath).catch(() => null);
      if (!stat || stat.mtimeMs >= cutoffMs) continue;

      try {
        await fs.rm(dirPath, { recursive: true, force: true });
        removed++;
      } catch (err) {
        this.log.warn(`failed to remove profile ${dirPath}: ${asString(err)}`);
      }
    }
    return removed;
  }

  private async sweepDebugArtifacts(cutoffMs: number): Promise<number> {
    const entries = await fs.readdir(DEBUG_ARTIFACTS_DIR).catch(() => null);
    if (!entries) return 0;

    let removed = 0;
    for (const name of entries) {
      const filePath = path.join(DEBUG_ARTIFACTS_DIR, name);
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat || !stat.isFile() || stat.mtimeMs >= cutoffMs) continue;

      try {
        await fs.unlink(filePath);
        removed++;
      } catch (err) {
        this.log.warn(`failed to remove artifact ${filePath}: ${asString(err)}`);
      }
    }
    return removed;
  }
}

function asString(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
