import { Injectable } from '@nestjs/common';
import { ExecutorRegistry } from './executor-registry.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { RetryPolicy } from '@domain/services/retry-policy';
import { ClaimedActionRow, GenericActionRepository } from '@persistence/repositories/action-repository';
import { ActionRepositoryFactory } from '@persistence/repositories/action-repository.factory';
import { ActionStrategyRegistry } from './strategies/action-strategy.registry';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult } from '@domain/ports/x-action-executor.port';
import { AccountsService } from '@/accounts/accounts.service';
import { PollingWorker, WorkerOptionsFactory, type WorkerLoopOptions } from '@/common/workers';

@Injectable()
export class ClaimWorker extends PollingWorker {
  private readonly inflight = new Set<Promise<unknown>>();
  protected readonly options: WorkerLoopOptions & { batchSize: number };

  constructor(
    private readonly registry: ExecutorRegistry,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly retry: RetryPolicy,
    private readonly accounts: AccountsService,
    private readonly repoFactory: ActionRepositoryFactory,
    private readonly strategies: ActionStrategyRegistry,
    private readonly optionsFactory: WorkerOptionsFactory,
  ) {
    super('worker');
    const base = this.optionsFactory.fromEnv('WORKER', { pollMs: 3000, lockTtlSec: 300 });
    this.options = {
      ...base,
      batchSize: this.optionsFactory.intFromEnv('WORKER_BATCH_SIZE', 1),
    };
  }

  protected async drainInflight(timeoutMs: number): Promise<void> {
    if (this.inflight.size === 0) return;
    this.log.log(`Waiting for ${this.inflight.size} in-flight action(s) to complete...`);
    await Promise.race([
      Promise.allSettled([...this.inflight]),
      new Promise((resolve) => setTimeout(resolve, timeoutMs).unref()),
    ]);
  }

  /**
   * Run one polling cycle against every registered action type. Public so
   * integration tests can deterministically advance the queue without
   * relying on the timer; production code never calls this directly — the
   * scheduleNext() loop owns invocation.
   */
  async tick(): Promise<void> {
    for (const type of this.registry.registered()) {
      if (this.stopped) return;
      const repo = this.repoFactory.forType(type);
      const claimed = await repo.claimBatch(this.workerId, this.options.batchSize, this.options.lockTtlSec);
      for (const row of claimed) {
        const p = this.dispatch(type, row, repo).catch((err) =>
          this.log.error(
            `Dispatch error: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err.stack : undefined,
          ),
        );
        this.inflight.add(p);
        p.finally(() => this.inflight.delete(p));
      }
    }
  }

  private async dispatch(
    type: ActionType,
    row: ClaimedActionRow,
    repo: GenericActionRepository,
  ): Promise<void> {
    const paused = await this.circuitBreaker.isPaused(row.account_id);
    if (paused) {
      const delay = new Date(Date.now() + 5 * 60 * 1000);
      await repo.markFailed(row.id, {
        status: 'pending',
        attempts: row.attempts,
        lastError: 'circuit breaker: account paused',
        errorClass: 'transient',
        scheduledAt: delay,
      });
      return;
    }

    const executor = this.registry.resolve(type);
    if (!executor) {
      this.log.warn(`No executor for ${type}, skipping ${row.id}`);
      return;
    }

    const strategy = this.strategies.forType(type);
    const ctx: ActionContext = {
      id: row.id,
      type,
      accountId: row.account_id,
      attempts: row.attempts,
      payload: strategy.toPayload(row) as Record<string, unknown>,
      metadata: row.metadata ?? {},
    };

    await repo.markRunning(row.id);

    let result: ExecutionResult;
    try {
      result = await executor.execute(ctx, {
        accountId: row.account_id,
        authToken: '',
      });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      result = { ok: false, errorClass: this.retry.classify(e), message: e.message };
    }

    await this.persistOutcome(row, result, repo);
  }

  private async persistOutcome(
    row: ClaimedActionRow,
    result: ExecutionResult,
    repo: GenericActionRepository,
  ): Promise<void> {
    if (result.ok) {
      const payload = result.result;
      if (payload.kind === 'tweet') {
        await repo.markSucceeded(row.id, {
          tweetId: payload.tweetId,
          tweetUrl: payload.tweetUrl,
          sentAt: new Date(payload.sentAt),
        });
      } else {
        await repo.markSucceeded(row.id, { resultAt: new Date(payload.at) });
      }
      await this.circuitBreaker.recordSuccess(row.account_id);
      await this.accounts.recordSessionSuccess(row.account_id);
      return;
    }

    const attempts = row.attempts + 1;
    const decision = this.retry.decide(attempts, result.errorClass, row.max_attempts);
    await repo.markFailed(row.id, {
      status: decision.shouldRetry ? 'failed' : 'dead',
      attempts,
      lastError: result.message,
      errorClass: result.errorClass,
      scheduledAt: decision.shouldRetry ? new Date(Date.now() + decision.delayMs) : undefined,
    });
    await this.circuitBreaker.recordFailure(row.account_id, result.message);
    if (result.errorClass === 'auth') {
      await this.accounts.recordSessionFailure(row.account_id, result.message);
    }
  }
}
