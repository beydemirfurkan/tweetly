import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { CircuitBreakerSnapshot, ICircuitBreaker } from '@domain/ports/circuit-breaker.port';

interface ControlRow {
  field: string;
  value: string;
}

const FAILURE_THRESHOLD = 3;
const PAUSE_MINUTES = 60;

@Injectable()
export class CircuitBreakerService implements ICircuitBreaker {
  constructor(private readonly dataSource: DataSource) {}

  async load(accountId: string): Promise<CircuitBreakerSnapshot> {
    const rows = (await this.dataSource.query(
      `SELECT key AS field, value FROM control_state WHERE account_id = $1`,
      [accountId],
    )) as ControlRow[];
    const map = new Map(rows.map((r) => [r.field, r.value]));
    const failures = parseInt(map.get('consecutiveFailures') ?? '0', 10);
    return {
      paused: map.get('paused') === 'true',
      reason: map.get('reason') ?? undefined,
      pausedAt: map.get('pausedAt') ?? undefined,
      pauseUntil: map.get('pauseUntil') ?? undefined,
      consecutiveFailures: Number.isFinite(failures) ? failures : 0,
      lastFailureAt: map.get('lastFailureAt') ?? undefined,
      lastFailure: map.get('lastFailure') ?? undefined,
      lastSuccessAt: map.get('lastSuccessAt') ?? undefined,
    };
  }

  async isPaused(accountId: string, now: Date = new Date()): Promise<boolean> {
    const snap = await this.load(accountId);
    if (!snap.paused) return false;
    if (!snap.pauseUntil) return true;
    return new Date(snap.pauseUntil) > now;
  }

  async recordSuccess(accountId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.upsert(accountId, [
      ['paused', 'false'],
      ['consecutiveFailures', '0'],
      ['lastSuccessAt', now],
    ]);
    await this.delete(accountId, ['reason', 'pausedAt', 'pauseUntil']);
  }

  async recordFailure(accountId: string, message: string): Promise<CircuitBreakerSnapshot> {
    const snap = await this.load(accountId);
    const failures = snap.consecutiveFailures + 1;
    const nowIso = new Date().toISOString();
    const updates: Array<[string, string]> = [
      ['consecutiveFailures', String(failures)],
      ['lastFailure', message],
      ['lastFailureAt', nowIso],
    ];
    if (failures >= FAILURE_THRESHOLD) {
      const pauseUntil = new Date(Date.now() + PAUSE_MINUTES * 60 * 1000).toISOString();
      updates.push(['paused', 'true']);
      updates.push(['reason', `circuit breaker: ${failures} consecutive failures`]);
      updates.push(['pausedAt', nowIso]);
      updates.push(['pauseUntil', pauseUntil]);
    }
    await this.upsert(accountId, updates);
    return this.load(accountId);
  }

  async clear(accountId: string): Promise<CircuitBreakerSnapshot> {
    await this.upsert(accountId, [
      ['paused', 'false'],
      ['consecutiveFailures', '0'],
    ]);
    await this.delete(accountId, ['reason', 'pausedAt', 'pauseUntil']);
    return this.load(accountId);
  }

  private async upsert(accountId: string, entries: Array<[string, string]>): Promise<void> {
    for (const [field, value] of entries) {
      await this.dataSource.query(
        `INSERT INTO control_state (key, account_id, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (key, account_id) DO UPDATE SET value = EXCLUDED.value`,
        [field, accountId, value],
      );
    }
  }

  private async delete(accountId: string, fields: string[]): Promise<void> {
    if (fields.length === 0) return;
    const placeholders = fields.map((_, i) => `$${i + 2}`).join(', ');
    await this.dataSource.query(
      `DELETE FROM control_state WHERE account_id = $1 AND key IN (${placeholders})`,
      [accountId, ...fields],
    );
  }
}
