import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountEntity } from '../persistence/entities/account.entity';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly repo: Repository<AccountEntity>,
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
}
