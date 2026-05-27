import { PollingWorker, type WorkerLoopOptions } from '../polling-worker.base';

class TestWorker extends PollingWorker {
  protected readonly options: WorkerLoopOptions;
  ticks = 0;
  preStartCalls = 0;
  shutdownAborts = 0;
  drainCalls: number[] = [];

  constructor(options: WorkerLoopOptions) {
    super('test');
    this.options = options;
  }

  protected async tick(): Promise<void> {
    this.ticks++;
  }

  protected async onPreStart(): Promise<void> {
    this.preStartCalls++;
  }

  protected onShutdownAbort(): void {
    this.shutdownAborts++;
  }

  protected async drainInflight(timeoutMs: number): Promise<void> {
    this.drainCalls.push(timeoutMs);
  }
}

class FailingTickWorker extends PollingWorker {
  protected readonly options: WorkerLoopOptions;
  errors = 0;

  constructor(options: WorkerLoopOptions) {
    super('failing');
    this.options = options;
    // Spy on the logger so test can observe error logging without console noise.
    jest.spyOn(this.log, 'error').mockImplementation(() => {
      this.errors++;
    });
  }

  protected async tick(): Promise<void> {
    throw new Error('boom');
  }
}

describe('PollingWorker', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('skips scheduleNext when disabled and never ticks', async () => {
    const w = new TestWorker({ pollIntervalMs: 10, lockTtlSec: 60, enabled: false });
    await w.onApplicationBootstrap();
    await new Promise((r) => setTimeout(r, 50));
    expect(w.ticks).toBe(0);
    expect(w.preStartCalls).toBe(0);
    await w.onModuleDestroy();
  });

  it('runs onPreStart before the first tick and ticks repeatedly while enabled', async () => {
    jest.useFakeTimers();
    const w = new TestWorker({ pollIntervalMs: 10, lockTtlSec: 60, enabled: true });
    await w.onApplicationBootstrap();
    expect(w.preStartCalls).toBe(1);
    // Drive the loop deterministically. Each tick is async; awaiting microtasks
    // before advancing the next interval keeps the count predictable.
    for (let i = 0; i < 3; i++) {
      jest.advanceTimersByTime(10);
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(w.ticks).toBeGreaterThanOrEqual(3);
    await w.onModuleDestroy();
  });

  it('fires onShutdownAbort and drainInflight on shutdown', async () => {
    const w = new TestWorker({ pollIntervalMs: 100, lockTtlSec: 60, enabled: true });
    await w.onApplicationBootstrap();
    await w.onModuleDestroy();
    expect(w.shutdownAborts).toBe(1);
    expect(w.drainCalls).toEqual([30_000]);
  });

  it('logs (but does not crash) when tick throws', async () => {
    jest.useFakeTimers();
    const w = new FailingTickWorker({ pollIntervalMs: 5, lockTtlSec: 60, enabled: true });
    await w.onApplicationBootstrap();
    jest.advanceTimersByTime(5);
    await Promise.resolve();
    await Promise.resolve();
    expect(w.errors).toBeGreaterThanOrEqual(1);
    await w.onModuleDestroy();
  });
});
