import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentConfigEntity } from '@persistence/entities/agent-config.entity';
import { AccountsService } from '@/accounts/accounts.service';

const ALLOWED_FORMATS = new Set(['micro', 'punch', 'spark', 'hook', 'storm', 'thunder']);
const DEFAULT_FORMATS = ['punch', 'spark', 'hook'];
const MIN_DAILY_TARGET = 1;
const MAX_DAILY_TARGET = 20;
const MIN_INTERVAL_MINUTES = 15;
const MAX_INTERVAL_MINUTES = 1440;

export interface CreateAgentConfigInput {
  userId: string;
  accountId: string;
  dailyTweetTarget?: number;
  formatPreference?: string[];
  topics?: string[];
  toneOverride?: string;
  scheduleIntervalMinutes?: number;
}

export interface UpdateAgentConfigInput {
  enabled?: boolean;
  dailyTweetTarget?: number;
  formatPreference?: string[];
  topics?: string[];
  toneOverride?: string | null;
  scheduleIntervalMinutes?: number;
}

interface NormalizedCreateAgentConfigInput {
  dailyTweetTarget: number;
  formatPreference: string[];
  topics: string[];
  toneOverride: string | null;
  scheduleIntervalMinutes: number;
}

@Injectable()
export class AgentConfigService {
  private readonly logger = new Logger(AgentConfigService.name);

  constructor(
    @InjectRepository(AgentConfigEntity)
    private readonly repo: Repository<AgentConfigEntity>,
    private readonly accounts: AccountsService,
  ) {}

  async findByUserId(userId: string): Promise<AgentConfigEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<AgentConfigEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByAccountId(accountId: string): Promise<AgentConfigEntity | null> {
    return this.repo.findOne({ where: { accountId } });
  }

  async create(input: CreateAgentConfigInput): Promise<AgentConfigEntity> {
    await this.assertAccountOwnership(input.userId, input.accountId);

    const existing = await this.repo.findOne({ where: { accountId: input.accountId, userId: input.userId } });
    if (existing) {
      this.logger.warn(`Agent config already exists for account ${input.accountId}`);
      return existing;
    }

    const normalized = normalizeCreateInput(input);
    const config = this.repo.create({
      userId: input.userId,
      accountId: input.accountId,
      dailyTweetTarget: normalized.dailyTweetTarget,
      formatPreference: normalized.formatPreference,
      topics: normalized.topics,
      toneOverride: normalized.toneOverride,
      scheduleIntervalMinutes: normalized.scheduleIntervalMinutes,
      enabled: false,
    });

    return this.repo.save(config);
  }

  async update(id: string, userId: string, input: UpdateAgentConfigInput): Promise<AgentConfigEntity> {
    const config = await this.repo.findOne({ where: { id } });
    if (!config) throw new NotFoundException('Agent config not found');
    if (config.userId !== userId) throw new ForbiddenException('Not your agent config');

    const normalized = normalizeUpdateInput(input);

    if (normalized.enabled !== undefined) config.enabled = normalized.enabled;
    if (normalized.dailyTweetTarget !== undefined) config.dailyTweetTarget = normalized.dailyTweetTarget;
    if (normalized.formatPreference !== undefined) config.formatPreference = normalized.formatPreference;
    if (normalized.topics !== undefined) config.topics = normalized.topics;
    if (normalized.toneOverride !== undefined) config.toneOverride = normalized.toneOverride;
    if (normalized.scheduleIntervalMinutes !== undefined) config.scheduleIntervalMinutes = normalized.scheduleIntervalMinutes;

    return this.repo.save(config);
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const config = await this.repo.findOne({ where: { id } });
    if (!config) throw new NotFoundException('Agent config not found');
    if (config.userId !== userId) throw new ForbiddenException('Not your agent config');

    const result = await this.repo.delete({ id });
    return (result.affected ?? 0) > 0;
  }

  async findEnabled(): Promise<AgentConfigEntity[]> {
    return this.repo.find({ where: { enabled: true } });
  }

  async updateLastRun(id: string): Promise<void> {
    await this.repo.update({ id }, { lastRunAt: new Date() });
  }

  async getTodayDraftCount(configId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.repo.manager
      .createQueryBuilder()
      .from('agent_drafts', 'd')
      .where('d.agent_config_id = :configId', { configId })
      .andWhere('d.created_at >= :today', { today })
      .getCount();
  }

  private async assertAccountOwnership(userId: string, accountId: string): Promise<void> {
    const account = await this.accounts.findByIdForUser(accountId, userId);
    if (!account) throw new ForbiddenException('Account does not belong to this user');
  }
}

function normalizeCreateInput(input: CreateAgentConfigInput): NormalizedCreateAgentConfigInput {
  return {
    dailyTweetTarget: normalizeInteger(input.dailyTweetTarget ?? 3, MIN_DAILY_TARGET, MAX_DAILY_TARGET, 'dailyTweetTarget'),
    formatPreference: normalizeFormats(input.formatPreference),
    topics: normalizeStringList(input.topics),
    toneOverride: normalizeOptionalText(input.toneOverride),
    scheduleIntervalMinutes: normalizeInteger(
      input.scheduleIntervalMinutes ?? 120,
      MIN_INTERVAL_MINUTES,
      MAX_INTERVAL_MINUTES,
      'scheduleIntervalMinutes',
    ),
  };
}

function normalizeUpdateInput(input: UpdateAgentConfigInput): UpdateAgentConfigInput {
  return {
    enabled: input.enabled,
    dailyTweetTarget: input.dailyTweetTarget === undefined
      ? undefined
      : normalizeInteger(input.dailyTweetTarget, MIN_DAILY_TARGET, MAX_DAILY_TARGET, 'dailyTweetTarget'),
    formatPreference: input.formatPreference === undefined ? undefined : normalizeFormats(input.formatPreference),
    topics: input.topics === undefined ? undefined : normalizeStringList(input.topics),
    toneOverride: input.toneOverride === undefined ? undefined : normalizeOptionalText(input.toneOverride),
    scheduleIntervalMinutes: input.scheduleIntervalMinutes === undefined
      ? undefined
      : normalizeInteger(input.scheduleIntervalMinutes, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES, 'scheduleIntervalMinutes'),
  };
}

function normalizeInteger(value: number, min: number, max: number, field: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new BadRequestException(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function normalizeFormats(formats?: string[]): string[] {
  if (!formats || formats.length === 0) return DEFAULT_FORMATS;

  const uniqueFormats = [...new Set(formats.map((format) => format.trim()).filter(Boolean))];
  const invalid = uniqueFormats.find((format) => !ALLOWED_FORMATS.has(format));
  if (invalid) throw new BadRequestException(`Unsupported tweet format: ${invalid}`);

  return uniqueFormats;
}

function normalizeStringList(values?: string[]): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}
