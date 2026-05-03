import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { ApiKeyEntity } from '@persistence/entities/api-key.entity';

const KEY_PREFIX = 'tk_';

export interface CreatedApiKey {
  id: string;
  plainKey: string;
  prefix: string;
  name: string;
}

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly repo: Repository<ApiKeyEntity>,
  ) {}

  async create(input: {
    userId: string;
    name: string;
    scopes?: string[];
    expiresAt?: Date | null;
  }): Promise<CreatedApiKey> {
    const random = randomBytes(32).toString('hex');
    const plainKey = `${KEY_PREFIX}${random}`;
    const keyHash = sha256(plainKey);
    const keyPrefix = plainKey.slice(0, 11);

    const entity = this.repo.create({
      userId: input.userId,
      name: input.name,
      keyHash,
      keyPrefix,
      scopes: input.scopes ?? ['*'],
      expiresAt: input.expiresAt ?? null,
    });
    const saved = await this.repo.save(entity);

    return { id: saved.id, plainKey, prefix: keyPrefix, name: saved.name };
  }

  async verify(plainKey: string): Promise<ApiKeyEntity | null> {
    if (!plainKey?.startsWith(KEY_PREFIX)) return null;
    const keyHash = sha256(plainKey);
    const row = await this.repo.findOne({
      where: { keyHash, revokedAt: IsNull() },
    });
    if (!row) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
    return row;
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.repo.update(id, { lastUsedAt: new Date() });
  }

  async listForUser(userId: string): Promise<ApiKeyEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async revoke(id: string, userId: string): Promise<boolean> {
    const result = await this.repo.update(
      { id, userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return (result.affected ?? 0) > 0;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
