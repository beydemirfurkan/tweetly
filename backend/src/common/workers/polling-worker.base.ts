import { Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

export interface WorkerLoopOptions {
  pollIntervalMs: number;
  lockTtlSec: number;
  enabled: boolean;
}

/**
 * Polling worker scaffold shared by ClaimWorker, LoginWorker and
 * ExtractionWorker. Owns the bootstrap → scheduleNext → tick → shutdown
 * lifecycle so each subclass only implements the single polling cycle
 * (`tick()`) plus optional pre-start and shutdown hooks.
 */
export abstract class PollingWorker implements OnApplicationBootstrap, OnModuleDestroy {
  protected readonly log: Logger;
  protected readonly workerId: string;
  protected stopped = false;
  private timer: NodeJS.Timeout | null = null;

  protected abstract readonly options: WorkerLoopOptions;

  /** Default 30s drain ceiling during shutdown. Override to tighten. */
  protected readonly shutdownDrainTimeoutMs: number = 30_000;

  constructor(workerNamePrefix: string) {
    this.workerId = `${workerNamePrefix}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    this.log = new Logger(this.constructor.name);
  }

  /** One polling cycle. Errors are caught + logged by scheduleNext(). */
  protected abstract tick(): Promise<void>;

  /** Optional: setup work that must complete before the first tick. */
  protected onPreStart?(): Promise<void>;

  /** Optional: signal in-flight work to bail out (e.g. AbortController). */
  protected onShutdownAbort?(): Promise<void> | void;

  /**
   * Optional: wait for in-flight work to settle. Implementations should
   * respect `timeoutMs` so shutdown can't hang indefinitely.
   */
  protected drainInflight?(timeoutMs: number): Promise<void>;

  async onApplicationBootstrap(): Promise<void> {
    if (!this.options.enabled) {
      this.log.log(`${this.constructor.name} disabled.`);
      return;
    }
    if (this.onPreStart) {
      try {
        await this.onPreStart();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.error(`onPreStart failed: ${msg}`);
      }
    }
    this.log.log(
      `${this.constructor.name} started: id=${this.workerId} poll=${this.options.pollIntervalMs}ms ` +
        `lock=${this.options.lockTtlSec}s`,
    );
    this.scheduleNext();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.onShutdownAbort) {
      try {
        await this.onShutdownAbort();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.warn(`onShutdownAbort threw: ${msg}`);
      }
    }
    if (this.drainInflight) {
      await this.drainInflight(this.shutdownDrainTimeoutMs);
    }
    this.log.log(`${this.constructor.name} stopped.`);
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
}
