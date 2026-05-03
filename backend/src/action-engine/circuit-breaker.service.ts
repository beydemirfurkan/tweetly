import { Injectable } from '@nestjs/common';
import type { CircuitBreakerSnapshot, ICircuitBreaker } from '@domain/ports/circuit-breaker.port';
import { ControlStateRepository } from '@persistence/repositories/control-state.repository';

const FAILURE_THRESHOLD = 3;
const PAUSE_MINUTES = 60;

const KEYS = {
  paused: 'paused',
  reason: 'reason',
  pausedAt: 'pausedAt',
  pauseUntil: 'pauseUntil',
  consecutiveFailures: 'consecutiveFailures',
  lastFailureAt: 'lastFailureAt',
  lastFailure: 'lastFailure',
  lastSuccessAt: 'lastSuccessAt',
} as const;

const ALL_KEYS = Object.values(KEYS);
const PAUSE_KEYS = [KEYS.reason, KEYS.pausedAt, KEYS.pauseUntil];

@Injectable()
export class CircuitBreakerService implements ICircuitBreaker {
  constructor(private readonly state: ControlStateRepository) {}

  async load(accountId: string): Promise<CircuitBreakerSnapshot> {
    const rows = await this.state.findByKeys(accountId, ALL_KEYS);
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const failures = parseInt(map.get(KEYS.consecutiveFailures) ?? '0', 10);
    return {
      paused: map.get(KEYS.paused) === 'true',
      reason: map.get(KEYS.reason) ?? undefined,
      pausedAt: map.get(KEYS.pausedAt) ?? undefined,
      pauseUntil: map.get(KEYS.pauseUntil) ?? undefined,
      consecutiveFailures: Number.isFinite(failures) ? failures : 0,
      lastFailureAt: map.get(KEYS.lastFailureAt) ?? undefined,
      lastFailure: map.get(KEYS.lastFailure) ?? undefined,
      lastSuccessAt: map.get(KEYS.lastSuccessAt) ?? undefined,
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
    await this.state.upsert(accountId, [
      [KEYS.paused, 'false'],
      [KEYS.consecutiveFailures, '0'],
      [KEYS.lastSuccessAt, now],
    ]);
    await this.state.deleteKeys(accountId, PAUSE_KEYS);
  }

  async recordFailure(accountId: string, message: string): Promise<CircuitBreakerSnapshot> {
    const snap = await this.load(accountId);
    const failures = snap.consecutiveFailures + 1;
    const nowIso = new Date().toISOString();
    const updates: Array<[string, string]> = [
      [KEYS.consecutiveFailures, String(failures)],
      [KEYS.lastFailure, message],
      [KEYS.lastFailureAt, nowIso],
    ];
    if (failures >= FAILURE_THRESHOLD) {
      const pauseUntil = new Date(Date.now() + PAUSE_MINUTES * 60 * 1000).toISOString();
      updates.push([KEYS.paused, 'true']);
      updates.push([KEYS.reason, `circuit breaker: ${failures} consecutive failures`]);
      updates.push([KEYS.pausedAt, nowIso]);
      updates.push([KEYS.pauseUntil, pauseUntil]);
    }
    await this.state.upsert(accountId, updates);
    return this.load(accountId);
  }

  async clear(accountId: string): Promise<CircuitBreakerSnapshot> {
    await this.state.upsert(accountId, [
      [KEYS.paused, 'false'],
      [KEYS.consecutiveFailures, '0'],
    ]);
    await this.state.deleteKeys(accountId, PAUSE_KEYS);
    return this.load(accountId);
  }
}
