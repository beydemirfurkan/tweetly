import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AccountEntity } from '../persistence/entities/account.entity';

const AUTH_FAILURE_PAUSE_THRESHOLD = parseInt(process.env.AUTH_FAILURE_PAUSE_THRESHOLD ?? '3', 10);

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly repo: Repository<AccountEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findById(id: string): Promise<AccountEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async listActive(): Promise<AccountEntity[]> {
    return this.repo.find({ where: { status: 'active' } });
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.repo.update({ id }, { lastUsedAt: new Date() });
  }

  async recordSessionSuccess(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.touchLastUsed(id);
    await this.upsertControlState(id, [
      ['session.health', 'healthy'],
      ['session.last_check_at', now],
      ['session.last_success_at', now],
      ['session.auth_failure_count', '0'],
    ]);
  }

  async recordSessionFailure(id: string, reason: string): Promise<number> {
    const now = new Date().toISOString();
    const failures = (await this.getControlNumber(id, 'session.auth_failure_count')) + 1;
    await this.upsertControlState(id, [
      ['session.health', 'unhealthy'],
      ['session.last_check_at', now],
      ['session.last_failure_at', now],
      ['session.last_failure_reason', reason.slice(0, 500)],
      ['session.auth_failure_count', String(failures)],
    ]);

    if (failures >= AUTH_FAILURE_PAUSE_THRESHOLD) {
      await this.repo.update({ id }, { status: 'paused' });
    }

    return failures;
  }

  private async getControlNumber(accountId: string, key: string): Promise<number> {
    const rows = (await this.dataSource.query(
      `SELECT value FROM control_state WHERE key = $1 AND account_id = $2`,
      [key, accountId],
    )) as Array<{ value: string }>;
    const value = parseInt(rows[0]?.value ?? '0', 10);
    return Number.isFinite(value) ? value : 0;
  }

  private async upsertControlState(accountId: string, entries: Array<[string, string]>): Promise<void> {
    for (const [key, value] of entries) {
      await this.dataSource.query(
        `INSERT INTO control_state (key, account_id, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (key, account_id) DO UPDATE SET value = EXCLUDED.value`,
        [key, accountId, value],
      );
    }
  }
}
