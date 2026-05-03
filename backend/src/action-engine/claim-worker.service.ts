import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ExecutorRegistry } from './executor-registry.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { RetryPolicy } from '@domain/services/retry-policy';
import { ACTION_TABLE_CONFIG, ClaimedActionRow, GenericActionRepository } from '@persistence/repositories/action-repository';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult } from '@domain/ports/x-action-executor.port';
import { AccountsService } from '@/accounts/accounts.service';

interface WorkerOptions {
  pollIntervalMs?: number;
  batchSize?: number;
  lockTtlSec?: number;
  enabled?: boolean;
}

@Injectable()
export class ClaimWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(ClaimWorker.name);
  private readonly workerId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private readonly inflight = new Set<Promise<unknown>>();
  private readonly options: Required<WorkerOptions>;

  constructor(
    private readonly dataSource: DataSource,
    private readonly registry: ExecutorRegistry,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly retry: RetryPolicy,
    private readonly accounts: AccountsService,
  ) {
    this.options = {
      pollIntervalMs: parseInt(process.env.WORKER_POLL_MS ?? '3000', 10),
      batchSize: parseInt(process.env.WORKER_BATCH_SIZE ?? '1', 10),
      lockTtlSec: parseInt(process.env.WORKER_LOCK_TTL_SEC ?? '300', 10),
      enabled: process.env.WORKER_DISABLED !== 'true',
    };
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.options.enabled) {
      this.log.log('ClaimWorker disabled (WORKER_DISABLED=true).');
      return;
    }
    this.log.log(`ClaimWorker started: id=${this.workerId} poll=${this.options.pollIntervalMs}ms batch=${this.options.batchSize}`);
    this.scheduleNext();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inflight.size > 0) {
      this.log.log(`Waiting for ${this.inflight.size} in-flight action(s) to complete...`);
      await Promise.race([
        Promise.allSettled([...this.inflight]),
        new Promise((resolve) => setTimeout(resolve, 30_000).unref()),
      ]);
    }
    this.log.log('ClaimWorker stopped.');
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.tick()
        .catch((err) => this.log.error(`Tick error: ${err instanceof Error ? err.message : String(err)}`))
        .finally(() => this.scheduleNext());
    }, this.options.pollIntervalMs);
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
      const cfg = ACTION_TABLE_CONFIG[type];
      const repo = new GenericActionRepository(this.dataSource, cfg);
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

    const ctx: ActionContext = {
      id: row.id,
      type,
      accountId: row.account_id,
      attempts: row.attempts,
      payload: this.extractPayload(type, row),
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

  private extractPayload(type: ActionType, row: ClaimedActionRow): Record<string, unknown> {
    switch (type) {
      case 'post':
        return {
          text: row.text,
          mediaPath: row.media_path,
          mediaPaths: row.media_paths ?? null,
          altTexts: row.alt_texts ?? null,
        };
      case 'reply':
        return { text: row.text, parentTweetUrl: row.parent_tweet_url };
      case 'quote':
        return { text: row.text, targetTweetUrl: row.target_tweet_url };
      case 'retweet':
      case 'like':
      case 'bookmark':
        return { targetTweetUrl: row.target_tweet_url };
      case 'follow':
        return { targetHandle: row.target_handle };
      // Queue-backed direct writes use snake_case payload keys to match how
      // their executors read action.payload.X (executors were written against
      // the DB column names rather than the camelCase used by older types).
      case 'unlike':
      case 'unretweet':
      case 'delete_tweet':
        return { target_tweet_url: row.target_tweet_url };
      case 'unfollow':
        return { target_handle: row.target_handle };
      case 'dm':
        return { target_handle: row.target_handle, message: row.message };
      case 'profile_update':
        return { fields: row.fields };
      case 'avatar_update':
      case 'banner_update':
        return { file_path: row.file_path };
      default:
        return {};
    }
  }
}
