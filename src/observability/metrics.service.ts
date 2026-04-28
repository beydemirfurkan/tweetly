import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from 'prom-client';
import type { ActionType } from '../domain/types/action.types';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly actionTotal = new Counter({
    name: 'tweetly_action_total',
    help: 'Total actions by type and outcome',
    labelNames: ['type', 'outcome'] as const,
    registers: [this.registry],
  });

  readonly actionDurationMs = new Histogram({
    name: 'tweetly_action_duration_ms',
    help: 'Action execution duration in ms',
    labelNames: ['type'] as const,
    buckets: [500, 1000, 2000, 5000, 10000, 30000],
    registers: [this.registry],
  });

  readonly queueDepth = new Gauge({
    name: 'tweetly_queue_depth',
    help: 'Queue depth by action type and status',
    labelNames: ['type', 'status'] as const,
    registers: [this.registry],
  });

  readonly circuitBreakerState = new Gauge({
    name: 'tweetly_circuit_breaker_paused',
    help: '1 if circuit breaker is paused for account',
    labelNames: ['account_id'] as const,
    registers: [this.registry],
  });

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  recordActionSuccess(type: ActionType, durationMs: number): void {
    this.actionTotal.labels(type, 'success').inc();
    this.actionDurationMs.labels(type).observe(durationMs);
  }

  recordActionFailure(type: ActionType, durationMs: number): void {
    this.actionTotal.labels(type, 'failure').inc();
    this.actionDurationMs.labels(type).observe(durationMs);
  }

  setQueueDepth(type: ActionType, status: string, count: number): void {
    this.queueDepth.labels(type, status).set(count);
  }

  setCircuitBreakerState(accountId: string, paused: boolean): void {
    this.circuitBreakerState.labels(accountId).set(paused ? 1 : 0);
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
