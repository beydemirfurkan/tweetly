import { Injectable, Logger } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { SettingsService } from '../settings/settings.service';
import { GithubTrendingWorkflow } from './collect-tweets.workflow';
import { WallpaperWorkflow } from './wallpaper.workflow';
import type { IContentWorkflow } from './content-workflow.interface';

@Injectable()
export class WorkflowDispatchService {
  private readonly log = new Logger(WorkflowDispatchService.name);
  private readonly workflows: Map<string, IContentWorkflow>;

  constructor(
    private readonly accounts: AccountsService,
    private readonly settings: SettingsService,
    private readonly githubTrending: GithubTrendingWorkflow,
    private readonly wallpaper: WallpaperWorkflow,
  ) {
    this.workflows = new Map<string, IContentWorkflow>([
      [githubTrending.scenarioType, githubTrending],
      [wallpaper.scenarioType, wallpaper],
    ]);
  }

  async runForAccount(accountId: string): Promise<void> {
    const type = await this.settings.get<string>('scenario.type', 'github_trending', accountId);
    const workflow = this.workflows.get(type);
    if (!workflow) {
      this.log.error(`Unknown scenario type "${type}" for account ${accountId}`);
      throw new Error(`Unknown scenario type: ${type}`);
    }
    this.log.log(`Running scenario "${type}" for account ${accountId}`);
    await workflow.run(accountId);
  }

  async runAll(): Promise<void> {
    const activeAccounts = await this.accounts.listActive();
    if (!activeAccounts.length) {
      this.log.warn('No active accounts found');
      return;
    }
    this.log.log(`Running workflows for ${activeAccounts.length} active account(s)`);
    for (const account of activeAccounts) {
      try {
        await this.runForAccount(account.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.error(`Workflow failed for account ${account.id}: ${msg}`);
      }
    }
  }
}
