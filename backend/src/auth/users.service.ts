import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '@persistence/entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
  ) {}

  async findById(id: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    return this.repo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: normalized })
      .getOne();
  }

  async findOrCreate(email: string): Promise<UserEntity> {
    const existing = await this.findByEmail(email);
    if (existing) return existing;
    const created = this.repo.create({ email: email.trim() });
    return this.repo.save(created);
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.repo.update(userId, { emailVerifiedAt: new Date(), updatedAt: new Date() });
  }
}
