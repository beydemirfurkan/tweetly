import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CopilotAnalysisEntity, type AnalysisType } from '@persistence/entities/copilot-analysis.entity';

export interface SaveAnalysisInput {
  userId: string;
  type: AnalysisType;
  accountId?: string;
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown>;
  modelUsed?: string;
  tokensUsed?: number;
}

@Injectable()
export class CopilotAnalysisService {
  private readonly logger = new Logger(CopilotAnalysisService.name);

  constructor(
    @InjectRepository(CopilotAnalysisEntity)
    private readonly repo: Repository<CopilotAnalysisEntity>,
  ) {}

  async save(input: SaveAnalysisInput): Promise<CopilotAnalysisEntity> {
    const entity = this.repo.create({
      userId: input.userId,
      type: input.type,
      accountId: input.accountId ?? null,
      inputData: input.inputData,
      resultData: input.resultData,
      modelUsed: input.modelUsed ?? null,
      tokensUsed: input.tokensUsed ?? null,
    });
    return this.repo.save(entity);
  }

  async getHistory(
    userId: string,
    type?: AnalysisType,
    limit = 10,
  ): Promise<CopilotAnalysisEntity[]> {
    const qb = this.repo
      .createQueryBuilder('ca')
      .where('ca.userId = :userId', { userId })
      .orderBy('ca.createdAt', 'DESC')
      .limit(limit);

    if (type) qb.andWhere('ca.type = :type', { type });

    return qb.getMany();
  }

  async getLatest(
    userId: string,
    type: AnalysisType,
  ): Promise<CopilotAnalysisEntity | null> {
    return this.repo.findOne({
      where: { userId, type },
      order: { createdAt: 'DESC' },
    });
  }
}
