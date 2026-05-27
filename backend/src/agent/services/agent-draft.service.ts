import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentDraftEntity, AgentDraftStatus } from '@persistence/entities/agent-draft.entity';
import { AgentConfigEntity } from '@persistence/entities/agent-config.entity';
import { ActionEnqueueService } from '@/action-engine/action-enqueue.service';
import { ContentMemoryService } from '@/content-memory/content-memory.service';

export interface CreateDraftInput {
  agentConfigId: string;
  accountId: string;
  text: string;
  format: string;
  estimatedScore?: number;
  reasoning?: string;
  sourceTopic?: string;
}

export interface DraftListFilters {
  status?: AgentDraftStatus;
  accountId?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AgentDraftService {
  private readonly logger = new Logger(AgentDraftService.name);

  constructor(
    @InjectRepository(AgentDraftEntity)
    private readonly repo: Repository<AgentDraftEntity>,
    @InjectRepository(AgentConfigEntity)
    private readonly configRepo: Repository<AgentConfigEntity>,
    private readonly enqueue: ActionEnqueueService,
    private readonly contentMemory: ContentMemoryService,
  ) {}

  async create(input: CreateDraftInput): Promise<AgentDraftEntity> {
    const draft = this.repo.create({
      agentConfigId: input.agentConfigId,
      accountId: input.accountId,
      text: input.text,
      format: input.format,
      status: 'pending',
      estimatedScore: input.estimatedScore ?? null,
      reasoning: input.reasoning ?? null,
      sourceTopic: input.sourceTopic ?? null,
    });

    return this.repo.save(draft);
  }

  async createMany(inputs: CreateDraftInput[]): Promise<AgentDraftEntity[]> {
    const drafts = inputs.map((input) =>
      this.repo.create({
        agentConfigId: input.agentConfigId,
        accountId: input.accountId,
        text: input.text,
        format: input.format,
        status: 'pending',
        estimatedScore: input.estimatedScore ?? null,
        reasoning: input.reasoning ?? null,
        sourceTopic: input.sourceTopic ?? null,
      }),
    );

    return this.repo.save(drafts);
  }

  async list(userId: string, filters: DraftListFilters = {}): Promise<{
    items: AgentDraftEntity[];
    total: number;
  }> {
    const qb = this.repo
      .createQueryBuilder('d')
      .innerJoin('agent_configs', 'c', 'c.id = d.agent_config_id')
      .where('c.user_id = :userId', { userId });

    if (filters.status) {
      qb.andWhere('d.status = :status', { status: filters.status });
    }
    if (filters.accountId) {
      qb.andWhere('d.account_id = :accountId', { accountId: filters.accountId });
    }

    const total = await qb.getCount();

    qb.orderBy('d.created_at', 'DESC')
      .limit(filters.limit ?? 20)
      .offset(filters.offset ?? 0);

    const items = await qb.getMany();

    return { items, total };
  }

  async findById(id: string): Promise<AgentDraftEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async approve(id: string, userId: string, scheduledAt?: Date): Promise<AgentDraftEntity> {
    const draft = await this.repo.findOne({ where: { id } });
    if (!draft) throw new NotFoundException('Draft not found');

    const config = await this.configRepo.findOne({ where: { id: draft.agentConfigId } });
    if (!config || config.userId !== userId) throw new ForbiddenException('Not your draft');

    if (draft.status !== 'pending') {
      throw new BadRequestException(`Draft is already ${draft.status}`);
    }

    const dedupReason = await this.contentMemory.similarityReason(draft.text, draft.accountId);
    if (dedupReason) {
      throw new BadRequestException(`Similar content already posted: ${dedupReason}`);
    }

    const publishAt = scheduledAt ?? new Date();
    const result = await this.enqueue.enqueuePost({
      accountId: draft.accountId,
      text: draft.text,
      scheduledAt: publishAt,
      metadata: { source: 'agent-draft', draftId: draft.id },
    });

    draft.status = 'approved';
    draft.actionId = result.id ?? result.idempotencyKey;
    draft.publishedAt = publishAt;

    await this.contentMemory.add('agent-draft', draft.text, draft.accountId);

    return this.repo.save(draft);
  }

  async reject(id: string, userId: string): Promise<AgentDraftEntity> {
    const draft = await this.repo.findOne({ where: { id } });
    if (!draft) throw new NotFoundException('Draft not found');

    const config = await this.configRepo.findOne({ where: { id: draft.agentConfigId } });
    if (!config || config.userId !== userId) throw new ForbiddenException('Not your draft');

    if (draft.status !== 'pending') {
      throw new BadRequestException(`Draft is already ${draft.status}`);
    }

    draft.status = 'rejected';
    return this.repo.save(draft);
  }

  async edit(id: string, userId: string, newText: string): Promise<AgentDraftEntity> {
    const draft = await this.repo.findOne({ where: { id } });
    if (!draft) throw new NotFoundException('Draft not found');

    const config = await this.configRepo.findOne({ where: { id: draft.agentConfigId } });
    if (!config || config.userId !== userId) throw new ForbiddenException('Not your draft');

    if (draft.status !== 'pending') {
      throw new BadRequestException(`Cannot edit draft with status: ${draft.status}`);
    }

    draft.text = newText;
    return this.repo.save(draft);
  }

  async editAndApprove(id: string, userId: string, newText: string, scheduledAt?: Date): Promise<AgentDraftEntity> {
    await this.edit(id, userId, newText);
    return this.approve(id, userId, scheduledAt);
  }

  async getStats(userId: string): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    published: number;
  }> {
    const result = await this.repo
      .createQueryBuilder('d')
      .select('d.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .innerJoin('agent_configs', 'c', 'c.id = d.agent_config_id')
      .where('c.user_id = :userId', { userId })
      .groupBy('d.status')
      .getRawMany();

    const stats = { pending: 0, approved: 0, rejected: 0, published: 0 };
    for (const row of result) {
      stats[row.status as keyof typeof stats] = parseInt(row.count, 10);
    }

    return stats;
  }
}
