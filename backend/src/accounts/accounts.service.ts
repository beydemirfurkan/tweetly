import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AccountEntity } from '@persistence/entities/account.entity';
import { ControlStateRepository } from '@persistence/repositories/control-state.repository';
import type { AccountStatus } from '@domain/types/account.types';

const AUTH_FAILURE_PAUSE_THRESHOLD = parseInt(process.env.AUTH_FAILURE_PAUSE_THRESHOLD ?? '3', 10);

export interface AccountSessionHealth {
  health: 'unknown' | 'healthy' | 'unhealthy';
  lastCheckAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  authFailureCount: number;
}

export interface AccountUpsertInput {
  id: string;
  userId: string;
  displayName?: string | null;
  authToken?: string;
  authMulti?: string | null;
  ct0?: string | null;
  twid?: string | null;
  status?: AccountStatus;
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly repo: Repository<AccountEntity>,
    private readonly dataSource: DataSource,
    private readonly state: ControlStateRepository,
  ) {}

  async findById(id: string): Promise<AccountEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByIdForUser(id: string, userId: string): Promise<AccountEntity | null> {
    return this.repo.findOne({ where: { id, userId } });
  }

  async listActive(): Promise<AccountEntity[]> {
    return this.repo.find({ where: { status: 'active' } });
  }

  async listActiveForUser(userId: string): Promise<AccountEntity[]> {
    return this.repo.find({ where: { status: 'active', userId } });
  }

  async listAll(): Promise<AccountEntity[]> {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  async listAllForUser(userId: string): Promise<AccountEntity[]> {
    return this.repo.find({ where: { userId }, order: { id: 'ASC' } });
  }

  async upsertAccount(input: AccountUpsertInput): Promise<AccountEntity> {
    const id = input.id.trim();
    const existing = await this.findById(id);
    if (existing && existing.userId !== input.userId) {
      throw new Error('account belongs to a different user');
    }
    if (!existing && !input.authToken) {
      throw new Error('authToken is required for new account');
    }

    const saved = await this.repo.save({
      id,
      userId: input.userId,
      displayName: input.displayName ?? existing?.displayName ?? id,
      authToken: input.authToken ?? existing?.authToken ?? '',
      authMulti: input.authMulti ?? existing?.authMulti ?? null,
      ct0: input.ct0 ?? existing?.ct0 ?? null,
      twid: input.twid ?? existing?.twid ?? null,
      status: input.status ?? existing?.status ?? 'active',
      createdAt: existing?.createdAt ?? new Date(),
      lastUsedAt: existing?.lastUsedAt ?? null,
    });

    return saved;
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.repo.update({ id }, { lastUsedAt: new Date() });
  }

  async getSessionHealthForAccounts(ids: string[]): Promise<Map<string, AccountSessionHealth>> {
    const out = new Map<string, AccountSessionHealth>();
    for (const id of ids) {
      out.set(id, { health: 'unknown', lastCheckAt: null, lastFailureAt: null, lastFailureReason: null, authFailureCount: 0 });
    }
    if (ids.length === 0) return out;
    const rows = await this.state.findByKeysForAccounts(ids, [
      'session.health',
      'session.last_check_at',
      'session.last_failure_at',
      'session.last_failure_reason',
      'session.auth_failure_count',
    ]);
    for (const row of rows) {
      const entry = out.get(row.account_id);
      if (!entry) continue;
      switch (row.key) {
        case 'session.health':
          if (row.value === 'healthy' || row.value === 'unhealthy') entry.health = row.value;
          break;
        case 'session.last_check_at':
          entry.lastCheckAt = row.value;
          break;
        case 'session.last_failure_at':
          entry.lastFailureAt = row.value;
          break;
        case 'session.last_failure_reason':
          entry.lastFailureReason = row.value;
          break;
        case 'session.auth_failure_count':
          entry.authFailureCount = parseInt(row.value, 10) || 0;
          break;
      }
    }
    return out;
  }

  async deleteAccount(id: string, userId: string): Promise<boolean> {
    const existing = await this.findByIdForUser(id, userId);
    if (!existing) return false;

    const actionTables = [
      'post_actions',
      'reply_actions',
      'like_actions',
      'bookmark_actions',
      'retweet_actions',
      'quote_actions',
      'follow_actions',
    ];
    await this.dataSource.transaction(async (manager) => {
      for (const table of actionTables) {
        await manager.query(
          `UPDATE ${table} SET status = 'cancelled', updated_at = now()
            WHERE account_id = $1 AND status IN ('pending', 'failed')`,
          [id],
        );
      }
      await manager.query(`DELETE FROM control_state WHERE account_id = $1`, [id]);
      await manager.query(`DELETE FROM content_memory WHERE account_id = $1`, [id]);
      await manager.query(`DELETE FROM accounts WHERE id = $1 AND user_id = $2`, [id, userId]);
    });
    return true;
  }

  async getSessionHealth(id: string): Promise<AccountSessionHealth> {
    const rows = await this.state.findByPrefix(id, 'session.');
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const failures = parseInt(map.get('session.auth_failure_count') ?? '0', 10);
    const rawHealth = map.get('session.health');
    const health: AccountSessionHealth['health'] =
      rawHealth === 'healthy' || rawHealth === 'unhealthy' ? rawHealth : 'unknown';
    return {
      health,
      lastCheckAt: map.get('session.last_check_at') ?? null,
      lastFailureAt: map.get('session.last_failure_at') ?? null,
      lastFailureReason: map.get('session.last_failure_reason') ?? null,
      authFailureCount: Number.isFinite(failures) ? failures : 0,
    };
  }

  async recordSessionSuccess(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.touchLastUsed(id);
    await this.state.upsert(id, [
      ['session.health', 'healthy'],
      ['session.last_check_at', now],
      ['session.last_success_at', now],
      ['session.auth_failure_count', '0'],
    ]);
  }

  async recordSessionFailure(id: string, reason: string): Promise<number> {
    const now = new Date().toISOString();
    const prior = parseInt((await this.state.findValue(id, 'session.auth_failure_count')) ?? '0', 10);
    const failures = (Number.isFinite(prior) ? prior : 0) + 1;
    await this.state.upsert(id, [
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

}
