import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  AccountLoginJobEntity,
  LoginJobFailureReason,
  LoginJobKind,
  LoginJobStatus,
} from '../../persistence/entities/account-login-job.entity';

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

  /**
   * Atomically promote one queued job to 'running' under a row-level lock.
   * `FOR UPDATE SKIP LOCKED` ensures multiple instances never claim the same
   * row even when their tick coincides.
   */
  async claimNext(lockTtlSec: number): Promise<ClaimedJob | null> {
    // TypeORM's `query()` for UPDATE…RETURNING returns the tuple
    // `[rows, rowCount]` (postgres driver), while SELECT returns just rows.
    // Normalise both shapes here.
    const raw = await this.dataSource.query(
      `WITH next AS (
         SELECT id FROM account_login_jobs
          WHERE status = 'queued'
            AND (locked_until IS NULL OR locked_until < now())
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

export type { AccountLoginJobEntity };
