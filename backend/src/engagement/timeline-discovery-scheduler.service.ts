import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { EngagementConfigService } from './engagement-config.service';
import { TimelineDiscoveryService } from './timeline-discovery.service';
import { AccountsService } from '../accounts/accounts.service';

const DEFAULT_INTERVAL_MS = 4 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 60 * 1000;

@Injectable()
export class TimelineDiscoveryScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(TimelineDiscoveryScheduler.name);
  private timers: NodeJS.Timeout[] = [];
  private readonly running = new Set<string>();

  constructor(
    private readonly discovery: TimelineDiscoveryService,
    private readonly configService: EngagementConfigService,
    private readonly accounts: AccountsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.X_EXECUTOR_MODE === 'noop') {
      this.log.log('TimelineDiscoveryScheduler disabled (noop mode)');
      return;
    }

    const startupTimer = setTimeout(() => {
      this.scheduleAll();
    }, STARTUP_DELAY_MS);
    this.timers.push(startupTimer);
  }

  onModuleDestroy(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private async scheduleAll(): Promise<void> {
    const accounts = await this.accounts.listActive();

    for (const account of accounts) {
      const config = await this.configService.get(account.id);
      if (!config.enabled || !config.timelineScrapeEnabled) continue;

      const intervalMs = config.timelineScrapeIntervalHours * 60 * 60 * 1000;

      const timer = setInterval(() => {
        this.runForAccount(account.id);
      }, intervalMs);

      this.timers.push(timer);

      this.runForAccount(account.id);
      this.log.log(`Scheduled timeline discovery for @${account.id} every ${config.timelineScrapeIntervalHours}h`);
    }
  }

  async runForAccount(accountId: string): Promise<void> {
    if (this.running.has(accountId)) {
      this.log.log(`Already running for @${accountId}, skipping`);
      return;
    }

    this.running.add(accountId);
    try {
      const account = await this.accounts.findById(accountId);
      const profileDir = account
        ? `data/user-data/${account.id}`
        : 'user-data';

      const result = await this.discovery.run(accountId, profileDir);
      this.log.log(`@${accountId}: scraped=${result.scraped} scheduled=${result.scheduled}`);
    } catch (err) {
      this.log.error(`Timeline discovery error for @${accountId}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running.delete(accountId);
    }
  }
}
