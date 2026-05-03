import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  ExtractionParams,
  ExtractionStatus,
  ExtractionType,
} from '@persistence/entities/extraction-job.entity';

export interface CreateExtractionInput {
  userId: string;
  accountId: string | null;
  type: ExtractionType;
  params: ExtractionParams;
  maxRows: number;
}

export interface ClaimedExtraction {
  id: string;
  userId: string;
  accountId: string | null;
  type: ExtractionType;
  params: ExtractionParams;
  maxRows: number;
  rowsExtracted: number;
  lastCursor: string | null;
}

export interface ExtractionView {
  id: string;
  userId: string;
  accountId: string | null;
  type: ExtractionType;
  params: ExtractionParams;
  maxRows: number;
  status: ExtractionStatus;
  rowsExtracted: number;
  filePath: string | null;
  errorDetail: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

@Injectable()
export class ExtractionJobsRepository {
  constructor(private readonly dataSource: DataSource) {}

  async create(input: CreateExtractionInput): Promise<{ id: string }> {
    const rows = (await this.dataSource.query(
      `INSERT INTO extraction_jobs
         (user_id, account_id, type, params, max_rows)
       VALUES ($1,$2,$3,$4::jsonb,$5)
       RETURNING id`,
      [input.userId, input.accountId, input.type, JSON.stringify(input.params), input.maxRows],
    )) as Array<{ id: string }>;
    return { id: rows[0].id };
  }

  /**
   * Atomically promote one queued job to 'running'. `FOR UPDATE SKIP LOCKED`
   * prevents two worker instances from racing on the same row.
   */
  async claimNext(lockTtlSec: number): Promise<ClaimedExtraction | null> {
    const raw = await this.dataSource.query(
      `WITH next AS (
         SELECT id FROM extraction_jobs
          WHERE status = 'queued'
            AND (locked_until IS NULL OR locked_until < now())
          ORDER BY created_at
          LIMIT 1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE extraction_jobs j
          SET status = 'running',
              started_at = COALESCE(j.started_at, now()),
              locked_until = now() + ($1 || ' seconds')::interval
         FROM next
        WHERE j.id = next.id
        RETURNING j.id, j.user_id, j.account_id, j.type, j.params, j.max_rows,
                  j.rows_extracted, j.last_cursor`,
      [lockTtlSec],
    );
    const rows = (Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw) as Array<{
      id: string;
      user_id: string;
      account_id: string | null;
      type: ExtractionType;
      params: ExtractionParams;
      max_rows: number;
      rows_extracted: number;
      last_cursor: string | null;
    }>;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      accountId: r.account_id,
      type: r.type,
      params: r.params,
      maxRows: r.max_rows,
      rowsExtracted: r.rows_extracted,
      lastCursor: r.last_cursor,
    };
  }

  /** Periodic progress update mid-extraction, refreshes the worker lock. */
  async updateProgress(
    id: string,
    rowsExtracted: number,
    cursor: string | null,
    lockTtlSec: number,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE extraction_jobs
          SET rows_extracted = $2,
              last_cursor = $3,
              locked_until = now() + ($4 || ' seconds')::interval
        WHERE id = $1`,
      [id, rowsExtracted, cursor, lockTtlSec],
    );
  }

  async markSuccess(id: string, filePath: string, totalRows: number): Promise<void> {
    await this.dataSource.query(
      `UPDATE extraction_jobs
          SET status = 'succeeded',
              file_path = $2,
              rows_extracted = $3,
              error_detail = NULL,
              locked_until = NULL,
              finished_at = now()
        WHERE id = $1`,
      [id, filePath, totalRows],
    );
  }

  async markFailure(id: string, detail: string, partialRows: number): Promise<void> {
    await this.dataSource.query(
      `UPDATE extraction_jobs
          SET status = 'failed',
              error_detail = $2,
              rows_extracted = $3,
              locked_until = NULL,
              finished_at = now()
        WHERE id = $1`,
      [id, detail.slice(0, 1000), partialRows],
    );
  }

  async cancelById(id: string, userId: string): Promise<boolean> {
    const result = (await this.dataSource.query(
      `UPDATE extraction_jobs
          SET status = 'cancelled',
              locked_until = NULL,
              finished_at = now()
        WHERE id = $1 AND user_id = $2 AND status IN ('queued','running')
       RETURNING id`,
      [id, userId],
    )) as Array<{ id: string }>;
    return result.length > 0;
  }

  async findByIdForUser(id: string, userId: string): Promise<ExtractionView | null> {
    const rows = (await this.dataSource.query(
      `SELECT id, user_id, account_id, type, params, max_rows, status,
              rows_extracted, file_path, error_detail,
              created_at, started_at, finished_at
         FROM extraction_jobs
        WHERE id = $1 AND user_id = $2`,
      [id, userId],
    )) as Array<RawRow>;
    if (rows.length === 0) return null;
    return rowToView(rows[0]);
  }

  async listForUser(userId: string, limit: number): Promise<ExtractionView[]> {
    const rows = (await this.dataSource.query(
      `SELECT id, user_id, account_id, type, params, max_rows, status,
              rows_extracted, file_path, error_detail,
              created_at, started_at, finished_at
         FROM extraction_jobs
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, limit],
    )) as Array<RawRow>;
    return rows.map(rowToView);
  }
}

interface RawRow {
  id: string;
  user_id: string;
  account_id: string | null;
  type: ExtractionType;
  params: ExtractionParams;
  max_rows: number;
  status: ExtractionStatus;
  rows_extracted: number;
  file_path: string | null;
  error_detail: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

function rowToView(r: RawRow): ExtractionView {
  return {
    id: r.id,
    userId: r.user_id,
    accountId: r.account_id,
    type: r.type,
    params: r.params,
    maxRows: r.max_rows,
    status: r.status,
    rowsExtracted: r.rows_extracted,
    filePath: r.file_path,
    errorDetail: r.error_detail,
    createdAt: r.created_at.toISOString(),
    startedAt: r.started_at?.toISOString() ?? null,
    finishedAt: r.finished_at?.toISOString() ?? null,
  };
}
