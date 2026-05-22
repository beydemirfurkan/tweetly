import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  AccountLoginJobEntity,
  LoginJobFailureReason,
  LoginJobKind,
  LoginJobStatus,
} from '@persistence/entities/account-login-job.entity';

export interface CreateLoginJobInput {
  userId: string;
  kind: LoginJobKind;
  targetAccountId: string | null;
  username: string;
  email: string | null;
  encryptedPassword: string;
  encryptedTotpSecret: string | null;
  saveTotpSecret: boolean;
  proxyCountry: string | null;
}

export interface ClaimedJob {
  id: string;
  userId: string;
  kind: LoginJobKind;
  targetAccountId: string | null;
  username: string;
  email: string | null;
  encryptedPassword: string;
  encryptedTotpSecret: string | null;
  saveTotpSecret: boolean;
  proxyCountry: string | null;
}

export interface JobStatusView {
  id: string;
  userId: string;
  kind: LoginJobKind;
  status: LoginJobStatus;
  targetAccountId: string | null;
  failureReason: LoginJobFailureReason | null;
  failureDetail: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface LoginCooldownView {
  username: string;
  failureCount: number;
  retryAfterSec: number;
  retryAt: string;
  manualReviewRequired: boolean;
}

const LOGIN_COOLDOWN_MS_BY_FAILURE_COUNT = [
  5 * 60 * 1000,
  30 * 60 * 1000,
  24 * 60 * 60 * 1000,
] as const;

@Injectable()
export class LoginJobsRepository {
  constructor(private readonly dataSource: DataSource) {}

  async create(input: CreateLoginJobInput): Promise<{ id: string }> {
    const rows = (await this.dataSource.query(
      `INSERT INTO account_login_jobs
         (user_id, kind, target_account_id, username, email,
          encrypted_password, encrypted_totp_secret, save_totp_secret, proxy_country)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        input.userId,
        input.kind,
        input.targetAccountId,
        input.username,
        input.email,
        input.encryptedPassword,
        input.encryptedTotpSecret,
        input.saveTotpSecret,
        input.proxyCountry,
      ],
    )) as Array<{ id: string }>;
    return { id: rows[0].id };
  }

  async findActiveCooldown(userId: string, username: string): Promise<LoginCooldownView | null> {
    const rows = (await this.dataSource.query(
      `SELECT status, finished_at
         FROM account_login_jobs
        WHERE user_id = $1
          AND LOWER(username) = LOWER($2)
          AND status IN ('success','failed')
          AND finished_at IS NOT NULL
        ORDER BY finished_at DESC
        LIMIT 3`,
      [userId, username],
    )) as Array<{ status: LoginJobStatus; finished_at: Date }>;

    if (rows[0]?.status !== 'failed') return null;

    const failureCount = countConsecutiveFailures(rows);
    if (failureCount === 0) return null;

    const cooldownMs = LOGIN_COOLDOWN_MS_BY_FAILURE_COUNT[Math.min(failureCount, 3) - 1];
    const lastFailureAt = new Date(rows[0].finished_at);
    const retryAt = new Date(lastFailureAt.getTime() + cooldownMs);
    const retryAfterSec = Math.ceil((retryAt.getTime() - Date.now()) / 1000);
    if (retryAfterSec <= 0) return null;

    return {
      username,
      failureCount,
      retryAfterSec,
      retryAt: retryAt.toISOString(),
      manualReviewRequired: failureCount >= 3,
    };
  }

  /**
   * Atomically promote one queued — OR ORPHANED RUNNING — job to 'running'
   * under a row-level lock. `FOR UPDATE SKIP LOCKED` ensures multiple
   * instances never claim the same row even when their tick coincides.
   *
   * A row with status='running' whose `locked_until` has elapsed signals a
   * worker that died mid-login (kill -9, container OOM, host reboot). We
   * reclaim those here instead of leaving them stranded forever. The
   * upstream LoginWorker should re-issue a heartbeat on a slower cadence
   * than `lockTtlSec` to keep the lock alive while it works (see
   * `extendLock`).
   */
  async claimNext(lockTtlSec: number): Promise<ClaimedJob | null> {
    // TypeORM's `query()` for UPDATE…RETURNING returns the tuple
    // `[rows, rowCount]` (postgres driver), while SELECT returns just rows.
    // Normalise both shapes here.
    const raw = await this.dataSource.query(
      `WITH next AS (
         SELECT id FROM account_login_jobs
          WHERE (
                  (status = 'queued' AND (locked_until IS NULL OR locked_until < now()))
                  OR
                  (status = 'running' AND locked_until IS NOT NULL AND locked_until < now())
                )
          ORDER BY created_at
          LIMIT 1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE account_login_jobs j
          SET status = 'running',
              started_at = COALESCE(j.started_at, now()),
              locked_until = now() + ($1 || ' seconds')::interval
         FROM next
        WHERE j.id = next.id
        RETURNING j.id, j.user_id, j.kind, j.target_account_id, j.username, j.email,
                  j.encrypted_password, j.encrypted_totp_secret,
                  j.save_totp_secret, j.proxy_country`,
      [lockTtlSec],
    );
    const rows = (Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw) as Array<{
      id: string;
      user_id: string;
      kind: LoginJobKind;
      target_account_id: string | null;
      username: string;
      email: string | null;
      encrypted_password: string;
      encrypted_totp_secret: string | null;
      save_totp_secret: boolean;
      proxy_country: string | null;
    }>;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      kind: r.kind,
      targetAccountId: r.target_account_id,
      username: r.username,
      email: r.email,
      encryptedPassword: r.encrypted_password,
      encryptedTotpSecret: r.encrypted_totp_secret,
      saveTotpSecret: r.save_totp_secret,
      proxyCountry: r.proxy_country,
    };
  }

  /**
   * Heartbeat call from a worker that is still actively processing job `id`.
   * Pushes `locked_until` forward so another instance does not steal the row
   * if the login overruns the original TTL. Affects only rows still in the
   * 'running' state we own.
   */
  async extendLock(id: string, lockTtlSec: number): Promise<void> {
    await this.dataSource.query(
      `UPDATE account_login_jobs
          SET locked_until = now() + ($2 || ' seconds')::interval
        WHERE id = $1 AND status = 'running'`,
      [id, lockTtlSec],
    );
  }

  /**
   * Boot-time recovery for crashed workers. Demotes any 'running' job whose
   * lock has already expired back to 'queued' so the next tick reclaims it
   * via the normal path. Idempotent; safe to run from every instance.
   */
  async resetStaleRunningJobs(): Promise<number> {
    const raw = (await this.dataSource.query(
      `UPDATE account_login_jobs
          SET status = 'queued',
              locked_until = NULL
        WHERE status = 'running'
          AND locked_until IS NOT NULL
          AND locked_until < now()
        RETURNING id`,
    )) as Array<{ id: string }> | [Array<{ id: string }>, number];
    const rows = Array.isArray(raw) && Array.isArray(raw[0]) ? (raw[0] as Array<{ id: string }>) : (raw as Array<{ id: string }>);
    return rows.length;
  }

  async markSuccess(id: string, opts: {
    targetAccountId: string;
    keepEncryptedTotp: boolean;
  }): Promise<void> {
    await this.dataSource.query(
      `UPDATE account_login_jobs
          SET status = 'success',
              target_account_id = $2,
              encrypted_password = NULL,
              encrypted_totp_secret = CASE WHEN $3 THEN encrypted_totp_secret ELSE NULL END,
              failure_reason = NULL,
              failure_detail = NULL,
              locked_until = NULL,
              finished_at = now()
        WHERE id = $1`,
      [id, opts.targetAccountId, opts.keepEncryptedTotp],
    );
  }

  async markFailure(id: string, reason: LoginJobFailureReason, detail: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE account_login_jobs
          SET status = 'failed',
              failure_reason = $2,
              failure_detail = $3,
              encrypted_password = NULL,
              encrypted_totp_secret = NULL,
              locked_until = NULL,
              finished_at = now()
        WHERE id = $1`,
      [id, reason, detail.slice(0, 500)],
    );
  }

  async findByIdForUser(id: string, userId: string): Promise<JobStatusView | null> {
    const rows = (await this.dataSource.query(
      `SELECT id, user_id, kind, status, target_account_id,
              failure_reason, failure_detail, created_at, started_at, finished_at
         FROM account_login_jobs
        WHERE id = $1 AND user_id = $2`,
      [id, userId],
    )) as Array<{
      id: string;
      user_id: string;
      kind: LoginJobKind;
      status: LoginJobStatus;
      target_account_id: string | null;
      failure_reason: LoginJobFailureReason | null;
      failure_detail: string | null;
      created_at: Date;
      started_at: Date | null;
      finished_at: Date | null;
    }>;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      kind: r.kind,
      status: r.status,
      targetAccountId: r.target_account_id,
      failureReason: r.failure_reason,
      failureDetail: r.failure_detail,
      createdAt: r.created_at.toISOString(),
      startedAt: r.started_at?.toISOString() ?? null,
      finishedAt: r.finished_at?.toISOString() ?? null,
    };
  }
}

function countConsecutiveFailures(rows: Array<{ status: LoginJobStatus }>): number {
  let count = 0;
  for (const row of rows) {
    if (row.status === 'success') return count;
    if (row.status === 'failed') count += 1;
  }
  return count;
}

export type { AccountLoginJobEntity };
