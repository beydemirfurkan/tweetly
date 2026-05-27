import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentConfigEntity } from '@persistence/entities/agent-config.entity';

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

@Injectable()
export class AgentConfigService {
  private readonly logger = new Logger(AgentConfigService.name);

  constructor(
    @InjectRepository(AgentConfigEntity)
    private readonly repo: Repository<AgentConfigEntity>,
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
    const existing = await this.repo.findOne({ where: { accountId: input.accountId } });
    if (existing) {
      this.logger.warn(`Agent config already exists for account ${input.accountId}`);
      return existing;
    }

    const config = this.repo.create({
      userId: input.userId,
      accountId: input.accountId,
      dailyTweetTarget: input.dailyTweetTarget ?? 3,
      formatPreference: input.formatPreference ?? ['punch', 'spark', 'hook'],
      topics: input.topics ?? [],
      toneOverride: input.toneOverride ?? null,
      scheduleIntervalMinutes: input.scheduleIntervalMinutes ?? 120,
      enabled: false,
    });

    return this.repo.save(config);
  }

  async update(id: string, userId: string, input: UpdateAgentConfigInput): Promise<AgentConfigEntity> {
    const config = await this.repo.findOne({ where: { id } });
    if (!config) throw new NotFoundException('Agent config not found');
    if (config.userId !== userId) throw new ForbiddenException('Not your agent config');

    if (input.enabled !== undefined) config.enabled = input.enabled;
    if (input.dailyTweetTarget !== undefined) config.dailyTweetTarget = input.dailyTweetTarget;
    if (input.formatPreference !== undefined) config.formatPreference = input.formatPreference;
    if (input.topics !== undefined) config.topics = input.topics;
    if (input.toneOverride !== undefined) config.toneOverride = input.toneOverride;
    if (input.scheduleIntervalMinutes !== undefined) config.scheduleIntervalMinutes = input.scheduleIntervalMinutes;

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
}
