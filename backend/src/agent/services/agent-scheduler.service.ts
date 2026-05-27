import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AgentConfigService } from './agent-config.service';
import { AgentPipelineService } from './agent-pipeline.service';

const SCHEDULER_INTERVAL_MS = parseInt(process.env.AGENT_SCHEDULER_INTERVAL_MS ?? '300000', 10);
const SCHEDULER_LOCK_KEY = '9182736450918273';

@Injectable()
export class AgentSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AgentSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly configService: AgentConfigService,
    private readonly pipeline: AgentPipelineService,
    private readonly dataSource: DataSource,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.AGENT_SCHEDULER_ENABLED === 'false') {
      this.logger.log('Agent scheduler disabled via AGENT_SCHEDULER_ENABLED=false');
      return;
    }
    this.logger.log(`Agent scheduler started, interval: ${SCHEDULER_INTERVAL_MS / 1000}s`);
    this.timer = setInterval(() => this.tick(), SCHEDULER_INTERVAL_MS);
    setTimeout(() => this.tick(), 45_000);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    let lockHeld = false;

    try {
      lockHeld = await this.tryAcquireLeaderLock();
      if (!lockHeld) {
        this.logger.debug('Agent scheduler tick skipped — another instance holds the leader lock');
        return;
      }

      const configs = await this.configService.findEnabled();
      if (configs.length === 0) return;

      this.logger.log(`Processing ${configs.length} enabled agent config(s) (leader)`);

      for (const config of configs) {
        try {
          await this.processConfig(config.id, config.accountId, config.scheduleIntervalMinutes, config.dailyTweetTarget);
        } catch (err) {
          this.logger.warn(`Agent config ${config.id} processing error: ${err instanceof Error ? err.message : err}`);
        }
      }
    } finally {
      if (lockHeld) {
        await this.releaseLeaderLock().catch((err) =>
          this.logger.warn(`Lock release failed: ${err instanceof Error ? err.message : err}`),
        );
      }
      this.running = false;
    }
  }

  private async processConfig(
    configId: string,
    accountId: string,
    intervalMinutes: number,
    dailyTarget: number,
  ): Promise<void> {
    const config = await this.configService.findById(configId);
    if (!config || !config.enabled) return;

    if (config.lastRunAt) {
      const elapsed = Date.now() - config.lastRunAt.getTime();
      const requiredMs = intervalMinutes * 60 * 1000;
      if (elapsed < requiredMs) {
        this.logger.debug(`Config ${configId}: interval not elapsed (${Math.round(elapsed / 60000)}min < ${intervalMinutes}min)`);
        return;
      }
    }

    const todayCount = await this.configService.getTodayDraftCount(configId);
    if (todayCount >= dailyTarget) {
      this.logger.debug(`Config ${configId}: daily target reached (${todayCount}/${dailyTarget})`);
      return;
    }

    const remaining = dailyTarget - todayCount;
    const toGenerate = Math.min(remaining, 3);

    this.logger.log(`Config ${configId}: generating ${toGenerate} draft(s) (${todayCount}/${dailyTarget} today)`);

    await this.pipeline.generateDrafts(config, toGenerate);
    await this.configService.updateLastRun(configId);
  }

  async triggerManually(configId: string, userId: string): Promise<{ draftsGenerated: number }> {
    const config = await this.configService.findById(configId);
    if (!config) throw new Error('Agent config not found');
    if (config.userId !== userId) throw new Error('Not your agent config');

    const drafts = await this.pipeline.generateDrafts(config, 3);
    return { draftsGenerated: drafts.length };
  }

  private async tryAcquireLeaderLock(): Promise<boolean> {
    try {
      const result = await this.dataSource.query(
        `SELECT pg_try_advisory_lock(${SCHEDULER_LOCK_KEY}) as acquired`,
      );
      return result?.[0]?.acquired === true;
    } catch {
      return false;
    }
  }

  private async releaseLeaderLock(): Promise<void> {
    await this.dataSource.query(`SELECT pg_advisory_unlock(${SCHEDULER_LOCK_KEY})`);
  }
}
