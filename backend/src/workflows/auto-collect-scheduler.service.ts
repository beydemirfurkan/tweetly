import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SettingsService } from '../settings/settings.service';
import { WorkflowDispatchService } from './workflow-dispatch.service';

const LOCK_KEY = 'tweetly:auto_collect';

@Injectable()
export class AutoCollectScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(AutoCollectScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastSuccessfulRunDate: string | null = null;

  constructor(
    private readonly dispatch: WorkflowDispatchService,
    private readonly settings: SettingsService,
    private readonly dataSource: DataSource,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.X_EXECUTOR_MODE === 'noop') {
      this.log.log('Auto collect disabled (noop mode).');
      return;
    }

    if (!(await this.isEnabled())) {
      this.log.log('Auto collect disabled by settings.');
      return;
    }

    const startupDelaySec = await this.settings.get<number>('auto_collect.startup_delay_sec', 60);
    this.timer = setTimeout(() => {
      this.runOnce('startup')
        .catch((err) => this.log.error(`Startup auto collect failed: ${this.formatError(err)}`))
        .finally(() => this.scheduleNextDailyRun());
    }, Math.max(0, startupDelaySec) * 1000);

    this.log.log(`Auto collect scheduled after ${startupDelaySec}s startup delay.`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async scheduleNextDailyRun(): Promise<void> {
    if (!(await this.isEnabled())) return;

    const hour = await this.settings.get<number>('auto_collect.run_hour', 8);
    const minute = await this.settings.get<number>('auto_collect.run_minute', 0);
    const nextRun = this.nextRunAt(hour, minute);
    const delayMs = Math.max(1000, nextRun.getTime() - Date.now());

    this.timer = setTimeout(() => {
      this.runOnce('daily')
        .catch((err) => this.log.error(`Daily auto collect failed: ${this.formatError(err)}`))
        .finally(() => this.scheduleNextDailyRun());
    }, delayMs);

    this.log.log(`Next auto collect scheduled at ${nextRun.toISOString()}.`);
  }

  private async runOnce(reason: 'startup' | 'daily'): Promise<void> {
    if (this.running) {
      this.log.log(`Auto collect already running, skipping ${reason}.`);
      return;
    }

    if (!(await this.isEnabled())) return;

    const today = this.localDateKey(new Date());
    if (this.lastSuccessfulRunDate === today) {
      this.log.log(`Auto collect already completed for ${today}, skipping ${reason}.`);
      return;
    }

    this.running = true;
    try {
      const ran = await this.withCollectLock(async () => {
        this.log.log(`Auto collect started (${reason}).`);
        await this.dispatch.runAll();
        this.lastSuccessfulRunDate = today;
        this.log.log(`Auto collect completed (${reason}).`);
      });

      if (!ran) this.log.log(`Auto collect lock busy, skipping ${reason}.`);
    } finally {
      this.running = false;
    }
  }

  private async withCollectLock(fn: () => Promise<void>): Promise<boolean> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      const rows = (await runner.query(
        'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',
        [LOCK_KEY],
      )) as Array<{ locked: boolean }>;

      if (!rows[0]?.locked) {
        await runner.rollbackTransaction();
        return false;
      }

      await fn();
      await runner.commitTransaction();
      return true;
    } catch (err) {
      await runner.rollbackTransaction();
      throw err;
    } finally {
      await runner.release();
    }
  }

  private async isEnabled(): Promise<boolean> {
    return this.settings.get<boolean>('auto_collect.enabled', false);
  }

  private nextRunAt(hourRaw: number, minuteRaw: number): Date {
    const hour = this.clampInt(hourRaw, 0, 23, 8);
    const minute = this.clampInt(minuteRaw, 0, 59, 0);
    const next = new Date();
    next.setHours(hour, minute, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
    return next;
  }

  private clampInt(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(value)));
  }

  private localDateKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  private formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
