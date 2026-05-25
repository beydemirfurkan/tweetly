import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CredentialCipherService } from '@common/crypto/credential-cipher.service';
import { AccountsService } from '@/accounts/accounts.service';
import { ProfileCacheService } from '@/accounts/profile-cache.service';
import { ClaimedJob, LoginJobsRepository } from './login-jobs.repository';
import { XLoginService } from './x-login.service';
import type { XLoginInput, XLoginResult } from './login.types';
import { hasLoginProxy } from './proxy-resolver';

interface WorkerOptions {
  pollIntervalMs: number;
  lockTtlSec: number;
  enabled: boolean;
}

/** Wait between the first attempt and the auto-retry, in ms. */
const RETRY_DELAY_MS = parseInt(process.env.LOGIN_WORKER_RETRY_DELAY_MS ?? '30000', 10);

/**
 * A failure is transient (worth one retry) when the reason is `unknown` AND
 * the detail looks like infrastructure noise rather than X policy. We never
 * retry on user-side reasons (invalid_credentials, captcha_required,
 * account_locked, login_cooldown, …) — re-trying those wastes the cooldown
 * window and confuses the user.
 *
 * Visible for unit tests.
 */
const TRANSIENT_DETAIL_PATTERNS = [
  /\bnet::/i,                  // chromium net errors (e.g. net::ERR_TIMED_OUT)
  /navigation timeout/i,       // patchright navigation timeout
  /Target page, context or browser has been closed/i,
  /ECONNRESET|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT/i,
  /step navigate:/i,           // navigate-step failures (DNS, route, transient X 5xx)
  /bir sorun oluştu|yeniden yüklemeyi dene|something went wrong|try reloading/i,
];

export function isTransientFailure(result: Extract<XLoginResult, { ok: false }>): boolean {
  if (result.reason !== 'unknown') return false;
  return TRANSIENT_DETAIL_PATTERNS.some((re) => re.test(result.detail));
}

function truncateForLog(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

@Injectable()
export class LoginWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(LoginWorker.name);
  private readonly workerId = `login-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private inflight: Promise<unknown> | null = null;
  // Abort signal sources for the currently-processing job. Held as a Set so
  // `onModuleDestroy` can fan out a shutdown abort without caring which
  // controller is active. Cleaned up in `process()` finally.
  private readonly activeAborts = new Set<AbortController>();
  private readonly options: WorkerOptions;

  constructor(
    private readonly dataSource: DataSource,
    private readonly jobs: LoginJobsRepository,
    private readonly login: XLoginService,
    private readonly cipher: CredentialCipherService,
    private readonly accounts: AccountsService,
    private readonly profileCache: ProfileCacheService,
  ) {
    this.options = {
      pollIntervalMs: parseInt(process.env.LOGIN_WORKER_POLL_MS ?? '3000', 10),
      // 5min: covers a slow login + 2FA + verify-home with margin. Past this
      // the row reverts to claimable (we treat the prior worker as crashed).
      lockTtlSec: parseInt(process.env.LOGIN_WORKER_LOCK_TTL_SEC ?? '300', 10),
      enabled: process.env.LOGIN_WORKER_DISABLED !== 'true',
    };
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.options.enabled) {
      this.log.log('LoginWorker disabled (LOGIN_WORKER_DISABLED=true).');
      return;
    }
    // Recover from previous-instance crashes: any 'running' row whose lock
    // already expired before this worker came up is demoted to 'queued' so
    // the normal tick picks it back up. Idempotent across multi-replica
    // boots — claimNext also re-handles orphans, this is just faster.
    try {
      const recovered = await this.jobs.resetStaleRunningJobs();
      if (recovered > 0) {
        this.log.warn(`Recovered ${recovered} orphaned 'running' login job(s) from a prior worker crash.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`resetStaleRunningJobs failed: ${msg}`);
    }
    this.log.log(
      `LoginWorker started: id=${this.workerId} poll=${this.options.pollIntervalMs}ms lock=${this.options.lockTtlSec}s`,
    );
    this.scheduleNext();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inflight) {
      // Fire shutdown aborts first — the login service polls the signal at
      // every step boundary, so the inflight promise should resolve in
      // seconds instead of waiting up to 30s for Patchright teardown.
      if (this.activeAborts.size > 0) {
        this.log.log(`Aborting ${this.activeAborts.size} in-flight login(s) for shutdown.`);
        for (const c of this.activeAborts) {
          try {
            c.abort();
          } catch {}
        }
      }
      this.log.log('Waiting for in-flight login to finish...');
      await Promise.race([
        this.inflight.catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 30_000).unref()),
      ]);
    }
    this.log.log('LoginWorker stopped.');
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.tick()
        .catch((err) =>
          this.log.error(`tick error: ${err instanceof Error ? err.message : String(err)}`),
        )
        .finally(() => this.scheduleNext());
    }, this.options.pollIntervalMs);
  }

  private async tick(): Promise<void> {
    // Single-job-per-tick: a login is heavy (browser + ~30s) and we don't want
    // one instance to monopolize the queue. Multiple replicas will pick in
    // parallel via SKIP LOCKED.
    if (this.inflight) return;
    const job = await this.jobs.claimNext(this.options.lockTtlSec);
    if (!job) return;

    const p = this.process(job)
      .catch((err) => {
        const detail = err instanceof Error ? err.message : String(err);
        this.log.error(`process error job=${job.id}: ${detail}`);
        return this.jobs
          .markFailure(job.id, 'unknown', `worker crashed: ${detail}`)
          .catch(() => undefined);
      })
      .finally(() => {
        this.inflight = null;
      });
    this.inflight = p;
    await p;
  }

  /** Visible for unit tests. */
  async process(job: ClaimedJob): Promise<void> {
    this.log.log(`process job=${job.id} kind=${job.kind} username=${job.username}`);

    // Keep the lock alive while we work. Cadence is TTL/3 so two heartbeats
    // are expected before another instance would consider the row orphaned.
    const heartbeatMs = Math.max(15_000, Math.floor((this.options.lockTtlSec * 1000) / 3));
    const heartbeat = setInterval(() => {
      this.jobs.extendLock(job.id, this.options.lockTtlSec).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.warn(`heartbeat extendLock failed job=${job.id}: ${msg}`);
      });
    }, heartbeatMs);
    heartbeat.unref();

    // Per-job abort controller — `onModuleDestroy` fires it during shutdown
    // so the in-flight Patchright session unwinds via LoginFlowError at the
    // next step boundary instead of running to completion.
    const abort = new AbortController();
    this.activeAborts.add(abort);

    try {
      await this.processInternal(job, abort.signal);
    } finally {
      clearInterval(heartbeat);
      this.activeAborts.delete(abort);
    }
  }

  private async processInternal(job: ClaimedJob, signal: AbortSignal): Promise<void> {
    // DB-driven cancellation probe used by XLoginService between every step.
    // We cap it at one query per step so a long flow doesn't dogpile the
    // table. The signal short-circuits this — shutdown aborts don't need a
    // DB roundtrip to be effective.
    const isCancelled = async (): Promise<boolean> => {
      if (signal.aborted) return true;
      try {
        return await this.jobs.isCancelled(job.id);
      } catch (err) {
        // Failing open is fine — the worst case is one extra step before we
        // realise the row was cancelled. Surface the error to logs but don't
        // turn a DB blip into a spurious 'cancelled' result.
        const msg = err instanceof Error ? err.message : String(err);
        this.log.warn(`isCancelled probe failed job=${job.id}: ${msg}`);
        return false;
      }
    };

    let creds: XLoginInput;
    try {
      creds = {
        username: job.username,
        email: job.email,
        password: this.cipher.decrypt(job.encryptedPassword),
        totpSecret: job.encryptedTotpSecret ? this.cipher.decrypt(job.encryptedTotpSecret) : null,
        proxyCountry: job.proxyCountry,
        // Reauth keeps the same account's user-data-dir so X sees a stable
        // browser across login + tool calls. Connect leaves it null and the
        // service falls back to a username-keyed staging dir.
        targetAccountId: job.kind === 'reauth' ? job.targetAccountId : null,
        isCancelled,
        signal,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.jobs.markFailure(job.id, 'unknown', `cipher error: ${msg}`);
      return;
    }

    const result: XLoginResult = await this.runWithRetries(job, creds);

    // Cancellation is terminal — no retries, no proxy fallback, no session
    // failure counters. The service may have flipped to cancelled mid-flow
    // OR the row was already cancelled before the worker picked it (e.g.
    // between claim and process). Either way: mark and return.
    if (!result.ok && result.reason === 'cancelled') {
      await this.jobs.markCancelled(job.id, result.detail);
      return;
    }

    if (!result.ok) {
      await this.jobs.markFailure(job.id, result.reason, result.detail);
      // Reauth failure for an existing account → bump session-failure counters
      // so the UI surfaces it on the same SessionHealthBadge channel.
      if (job.kind === 'reauth' && job.targetAccountId) {
        await this.accounts
          .recordSessionFailure(job.targetAccountId, `${result.reason}: ${result.detail}`)
          .catch((e) => this.log.warn(`recordSessionFailure swallow: ${e}`));
      }
      return;
    }

    // Success path: persist cookies + flip session health to healthy.
    const accountId = result.screenName.toLowerCase();
    if (job.kind === 'reauth' && job.targetAccountId && job.targetAccountId !== accountId) {
      // Hard mismatch — credentials logged in to a different account than the
      // one being re-authed. Treat as failure to avoid silently rebinding.
      await this.jobs.markFailure(
        job.id,
        'invalid_credentials',
        `reauth target=${job.targetAccountId} but logged in as=${accountId}`,
      );
      return;
    }

    await this.upsertAccountWithCookies(job, accountId, result);

    await this.jobs.markSuccess(job.id, {
      targetAccountId: accountId,
      keepEncryptedTotp: job.saveTotpSecret,
    });
    await this.accounts
      .recordSessionSuccess(accountId)
      .catch((e) => this.log.warn(`recordSessionSuccess swallow: ${e}`));

    this.profileCache.refreshInBackground(accountId);

    this.log.log(`success job=${job.id} accountId=${accountId} duration=${result.durationMs}ms`);
  }

  /**
   * Initial login attempt plus optional in-process retries (transient
   * infra hiccup + proxy fallback). Each retry is gated on the per-user
   * cooldown and short-circuits as soon as the result is `ok`, `cancelled`,
   * or no further retry applies. Pulled out of `processInternal` to keep
   * each function within the lint cap and to give the retry policy a
   * single test surface.
   */
  private async runWithRetries(job: ClaimedJob, creds: XLoginInput): Promise<XLoginResult> {
    let result: XLoginResult = await this.login.run(creds);

    if (result.ok || (!result.ok && result.reason === 'cancelled')) return result;

    // Auto-retry once for transient infra hiccups (network drop, navigation
    // timeout that didn't reach the login URL). User-side failures
    // (invalid_credentials, captcha_required, account_locked, …) bypass the
    // retry — re-trying those just burns the cooldown counter.
    if (isTransientFailure(result) && (await this.cooldownClearOrSkip(job, 'transient retry'))) {
      this.log.warn(
        `transient login failure job=${job.id} reason=${result.reason} ` +
          `detail=${truncateForLog(result.detail, 120)} — retrying once after ${RETRY_DELAY_MS}ms`,
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      result = await this.login.run(creds);
      this.log.log(
        `retry result job=${job.id} ok=${result.ok} ` +
          `reason=${result.ok ? '-' : result.reason} duration=${result.durationMs}ms`,
      );
      if (result.ok || result.reason === 'cancelled') return result;
    }

    const fallbackProxyCountry = chooseFallbackProxyCountry(creds.proxyCountry);
    if (
      fallbackProxyCountry &&
      shouldRetryWithFallbackProxy(result) &&
      (await this.cooldownClearOrSkip(job, 'proxy fallback'))
    ) {
      this.log.warn(
        `login failed on current egress job=${job.id} reason=${result.reason} ` +
          `— retrying once with proxyCountry=${fallbackProxyCountry}`,
      );
      result = await this.login.run({ ...creds, proxyCountry: fallbackProxyCountry });
      this.log.log(
        `proxy retry result job=${job.id} ok=${result.ok} ` +
          `reason=${result.ok ? '-' : result.reason} duration=${result.durationMs}ms`,
      );
    }

    return result;
  }

  /**
   * Returns true when an in-process retry is still allowed. Returns false
   * (and logs) when the per-user/username cooldown has just kicked in
   * between the original attempt and the retry — the worker must NOT
   * dogpile more attempts in the same process() window, because that
   * violates the same cooldown the API enforced at job creation.
   */
  private async cooldownClearOrSkip(job: ClaimedJob, retryKind: string): Promise<boolean> {
    try {
      const cooldown = await this.jobs.findActiveCooldown(job.userId, job.username);
      if (cooldown) {
        this.log.warn(
          `skipping ${retryKind} for job=${job.id}: cooldown active ` +
            `(failureCount=${cooldown.failureCount}, retryAfterSec=${cooldown.retryAfterSec})`,
        );
        return false;
      }
      return true;
    } catch (err) {
      // Fail open — the worst case is one extra retry, which is far less
      // damaging than swallowing an actual transient failure forever.
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`findActiveCooldown check failed for job=${job.id}, allowing retry: ${msg}`);
      return true;
    }
  }

  /**
   * Cookie persistence + TOTP-secret retention in one transaction so a
   * partial failure can't leave an account row with mismatched secrets.
   */
  private async upsertAccountWithCookies(
    job: ClaimedJob,
    accountId: string,
    result: Extract<XLoginResult, { ok: true }>,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const existing = (await manager.query(
        `SELECT id, user_id, status, totp_secret_encrypted, proxy_country
           FROM accounts WHERE id = $1`,
        [accountId],
      )) as Array<{ id: string; user_id: string; status: string; totp_secret_encrypted: string | null; proxy_country: string | null }>;

      if (existing.length > 0 && existing[0].user_id !== job.userId) {
        throw new Error(`account ${accountId} belongs to another user`);
      }

      const totpToStore =
        job.saveTotpSecret && job.encryptedTotpSecret
          ? job.encryptedTotpSecret
          : existing[0]?.totp_secret_encrypted ?? null;

      const params = [
        accountId,
        this.cipher.encrypt(result.cookies.authToken),
        this.cipher.encrypt(result.cookies.ct0),
        result.cookies.twid ? this.cipher.encrypt(result.cookies.twid) : null,
        totpToStore,
        job.proxyCountry,
      ];

      if (existing.length === 0) {
        await manager.query(
          `INSERT INTO accounts
             (id, user_id, display_name, auth_token, ct0, twid,
              status, totp_secret_encrypted, proxy_country, created_at, last_used_at)
           VALUES ($1,$7,$8,$2,$3,$4,'active',$5,$6, now(), now())`,
          [...params, job.userId, result.screenName],
        );
      } else {
        await manager.query(
          `UPDATE accounts
              SET auth_token = $2,
                  ct0 = $3,
                  twid = $4,
                  status = 'active',
                  totp_secret_encrypted = $5,
                  proxy_country = COALESCE($6, proxy_country),
                  last_used_at = now()
            WHERE id = $1`,
          params,
        );
      }
    });
  }
}

export function chooseFallbackProxyCountry(current: string | null | undefined): string | null {
  const normalizedCurrent = current?.trim().toUpperCase() || null;
  return fallbackProxyCountries().find((cc) => cc !== normalizedCurrent && hasLoginProxy(cc)) ?? null;
}

export function shouldRetryWithFallbackProxy(result: Extract<XLoginResult, { ok: false }>): boolean {
  // login_cooldown is an account-level signal from X — changing egress IP
  // does not lift it, it only makes us look more suspicious to anti-abuse.
  if (result.reason === 'login_cooldown') return false;
  if (result.reason === 'home_not_reached') {
    return /retryable login page before username input|username step did not advance|password field never appeared|did not reach \/home/i.test(result.detail);
  }
  return isTransientFailure(result);
}

function parseCountryList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s, index, arr) => /^[A-Z]{2}$/.test(s) && arr.indexOf(s) === index);
}

function fallbackProxyCountries(): string[] {
  return parseCountryList(process.env.LOGIN_FALLBACK_PROXY_COUNTRIES ?? 'US');
}
