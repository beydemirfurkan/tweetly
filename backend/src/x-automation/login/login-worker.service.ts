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
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.jobs.markFailure(job.id, 'unknown', `cipher error: ${msg}`);
      return;
    }

    let result: XLoginResult = await this.login.run(creds);

    // Auto-retry once for transient infra hiccups (network drop, navigation
    // timeout that didn't reach the login URL). User-side failures
    // (invalid_credentials, captcha_required, account_locked, …) bypass the
    // retry — re-trying those just burns the cooldown counter.
    if (!result.ok && isTransientFailure(result)) {
      this.log.warn(
        `transient login failure job=${job.id} reason=${result.reason} ` +
          `detail=${truncateForLog(result.detail, 120)} — retrying once after ${RETRY_DELAY_MS}ms`,
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      const retry: XLoginResult = await this.login.run(creds);
      this.log.log(
        `retry result job=${job.id} ok=${retry.ok} ` +
          `reason=${retry.ok ? '-' : retry.reason} duration=${retry.durationMs}ms`,
      );
      result = retry;
    }

    const fallbackProxyCountry = !result.ok ? chooseFallbackProxyCountry(creds.proxyCountry) : null;
    if (!result.ok && fallbackProxyCountry && shouldRetryWithFallbackProxy(result)) {
      this.log.warn(
        `login failed on current egress job=${job.id} reason=${result.reason} ` +
          `— retrying once with proxyCountry=${fallbackProxyCountry}`,
      );
      const retry: XLoginResult = await this.login.run({ ...creds, proxyCountry: fallbackProxyCountry });
      this.log.log(
        `proxy retry result job=${job.id} ok=${retry.ok} ` +
          `reason=${retry.ok ? '-' : retry.reason} duration=${retry.durationMs}ms`,
      );
      result = retry;
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
        result.cookies.authToken,
        result.cookies.ct0,
        result.cookies.twid,
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
  if (result.reason === 'login_cooldown') {
    return /onboarding rejected login temporarily|could not log you in now|try again later/i.test(result.detail);
  }
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
