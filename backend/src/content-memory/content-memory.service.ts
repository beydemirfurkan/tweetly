import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentMemoryEntity } from '@persistence/entities/content-memory.entity';
import { TextNormalizer } from './text-normalizer.service';
import { SimilarityScorer } from './similarity-scorer.service';

const SIMILARITY_THRESHOLD = 0.72;
const MAX_RECENT = 150;

@Injectable()
export class ContentMemoryService {
  constructor(
    @InjectRepository(ContentMemoryEntity)
    private readonly repo: Repository<ContentMemoryEntity>,
    private readonly normalizer: TextNormalizer,
    private readonly scorer: SimilarityScorer,
  ) {}

  async similarityReason(text: string, accountId?: string | null): Promise<string | null> {
    const textHash = this.scorer.hash(this.normalizer.normalize(text));
    const sig = this.normalizer.signature(text);
    const textTokens = this.normalizer.tokenize(text);

    let qb = this.repo
      .createQueryBuilder('cm')
      .select(['cm.repo', 'cm.textHash', 'cm.text'])
      .orderBy('cm.createdAt', 'DESC')
      .limit(MAX_RECENT);

    if (accountId) {
      qb = qb.where('(cm.accountId = :accountId OR cm.accountId IS NULL)', { accountId });
    }

    const rows = await qb.getMany();

    for (const row of rows) {
      if (row.textHash === textHash) return `exact hash match: ${row.repo}`;
      if (this.normalizer.signature(row.text) === sig) return `same opening signature: ${row.repo}`;
      if (this.scorer.jaccard(textTokens, this.normalizer.tokenize(row.text)) >= SIMILARITY_THRESHOLD) {
        return `high keyword overlap: ${row.repo}`;
      }
    }

    return null;
  }

  async add(repoSlug: string, text: string, accountId?: string | null): Promise<void> {
    const normalized = this.normalizer.normalize(text);
    await this.repo.insert({
      repo: repoSlug,
      textHash: this.scorer.hash(normalized),
      signature: this.normalizer.signature(text),
      text,
      accountId: accountId ?? null,
    });
  }
}
