import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface ControlStateRow {
  key: string;
  account_id: string;
  value: string;
}

/**
 * Generic key-value store over `control_state`. Two services consumed this
 * table with identical UPSERT/DELETE primitives copy-pasted (CircuitBreaker
 * for breaker state, AccountsService for session health). Centralising the
 * SQL here keeps the table contract — composite PK (key, account_id), upsert
 * semantics — in one file the next time it changes shape.
 */
@Injectable()
export class ControlStateRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Fetch rows by exact key list. Returns whatever exists; missing keys
   * simply don't appear in the result.
   */
  async findByKeys(accountId: string, keys: string[]): Promise<ControlStateRow[]> {
    if (keys.length === 0) return [];
    const placeholders = keys.map((_, i) => `$${i + 2}`).join(', ');
    return this.dataSource.query(
      `SELECT key, account_id, value FROM control_state
        WHERE account_id = $1 AND key IN (${placeholders})`,
      [accountId, ...keys],
    );
  }

  /**
   * Same as findByKeys but for many accounts at once. Used by list/dashboard
   * paths that need a single round-trip.
   */
  async findByKeysForAccounts(accountIds: string[], keys: string[]): Promise<ControlStateRow[]> {
    if (accountIds.length === 0 || keys.length === 0) return [];
    return this.dataSource.query(
      `SELECT key, account_id, value FROM control_state
        WHERE account_id = ANY($1) AND key = ANY($2)`,
      [accountIds, keys],
    );
  }

  /** Fetch all rows whose key starts with `prefix` for a single account. */
  async findByPrefix(accountId: string, prefix: string): Promise<ControlStateRow[]> {
    return this.dataSource.query(
      `SELECT key, account_id, value FROM control_state
        WHERE account_id = $1 AND key LIKE $2`,
      [accountId, `${prefix}%`],
    );
  }

  /** All rows for an account (no key filter). */
  async findAll(accountId: string): Promise<ControlStateRow[]> {
    return this.dataSource.query(
      `SELECT key, account_id, value FROM control_state WHERE account_id = $1`,
      [accountId],
    );
  }

  async findValue(accountId: string, key: string): Promise<string | null> {
    const rows: Array<{ value: string }> = await this.dataSource.query(
      `SELECT value FROM control_state WHERE key = $1 AND account_id = $2`,
      [key, accountId],
    );
    return rows[0]?.value ?? null;
  }

  /**
   * Idempotent upsert of a (key, value) batch for a single account. Issues
   * one INSERT … ON CONFLICT per entry — fine for the small batches both
   * callers use today; if a hot path appears, add a multi-row VALUES form.
   */
  async upsert(accountId: string, entries: Array<[key: string, value: string]>): Promise<void> {
    for (const [key, value] of entries) {
      await this.dataSource.query(
        `INSERT INTO control_state (key, account_id, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (key, account_id) DO UPDATE SET value = EXCLUDED.value`,
        [key, accountId, value],
      );
    }
  }

  async deleteKeys(accountId: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const placeholders = keys.map((_, i) => `$${i + 2}`).join(', ');
    await this.dataSource.query(
      `DELETE FROM control_state WHERE account_id = $1 AND key IN (${placeholders})`,
      [accountId, ...keys],
    );
  }
}
