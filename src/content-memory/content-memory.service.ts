import crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentMemoryEntity } from '../persistence/entities/content-memory.entity';

const SIMILARITY_THRESHOLD = 0.72;
const MAX_RECENT = 150;

@Injectable()
export class ContentMemoryService {
  constructor(
    @InjectRepository(ContentMemoryEntity)
    private readonly repo: Repository<ContentMemoryEntity>,
  ) {}

  private hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, '')
      .replace(/repo:|github:|kaynak:/g, '')
      .replace(/[^a-z0-9ğüşöçıİ\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private signature(text: string): string {
    return this.normalize(text).split(' ').slice(0, 14).join(' ');
  }

  private tokens(text: string): Set<string> {
    return new Set(this.normalize(text).split(' ').filter((w) => w.length > 3));
  }

  private jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) {
      if (b.has(token)) intersection++;
    }
    return intersection / (a.size + b.size - intersection);
  }

  async similarityReason(text: string, accountId?: string | null): Promise<string | null> {
    const textHash = this.hash(this.normalize(text));
    const sig = this.signature(text);
    const textTokens = this.tokens(text);

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
      if (this.signature(row.text) === sig) return `same opening signature: ${row.repo}`;
      if (this.jaccard(textTokens, this.tokens(row.text)) >= SIMILARITY_THRESHOLD) {
        return `high keyword overlap: ${row.repo}`;
      }
    }

    return null;
  }

  async add(repoSlug: string, text: string, accountId?: string | null): Promise<void> {
    const normalized = this.normalize(text);
    await this.repo.insert({
      repo: repoSlug,
      textHash: this.hash(normalized),
      signature: this.signature(text),
      text,
      accountId: accountId ?? null,
    });
  }
}
