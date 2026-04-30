import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { MagicLinkEntity } from '../persistence/entities/magic-link.entity';

const LINK_TTL_MIN = 15;

@Injectable()
export class MagicLinkService {
  private readonly log = new Logger(MagicLinkService.name);

  constructor(
    @InjectRepository(MagicLinkEntity)
    private readonly repo: Repository<MagicLinkEntity>,
  ) {}

  async issue(userId: string, email: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + LINK_TTL_MIN * 60 * 1000);

    await this.repo.insert({ userId, tokenHash, expiresAt });
    this.deliver(email, token);
    return { token, expiresAt };
  }

  async consume(token: string): Promise<string | null> {
    if (!token) return null;
    const tokenHash = sha256(token);
    const row = await this.repo.findOne({ where: { tokenHash, consumedAt: IsNull() } });
    if (!row) return null;
    if (row.expiresAt.getTime() < Date.now()) return null;

    await this.repo.update(row.id, { consumedAt: new Date() });
    return row.userId;
  }

  private deliver(email: string, token: string): void {
    const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const link = `${baseUrl}/auth/verify?token=${token}`;
    const provider = (process.env.MAIL_PROVIDER ?? 'console').toLowerCase();

    if (provider === 'console') {
      this.log.log(`[MAGIC_LINK] ${email} → ${link}`);
      return;
    }
    this.log.warn(`MAIL_PROVIDER=${provider} not implemented; falling back to console log`);
    this.log.log(`[MAGIC_LINK] ${email} → ${link}`);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
