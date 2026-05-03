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

  async findByClerkUserId(clerkUserId: string): Promise<UserEntity | null> {
    if (!clerkUserId) return null;
    return this.repo.findOne({ where: { clerkUserId } });
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

  /**
   * Resolves a Clerk-authenticated identity to a local user.
   * - If `clerk_user_id` is already set, returns that user.
   * - Else if email matches an existing local user, links `clerk_user_id` to it.
   * - Else creates a fresh user with both fields set.
   */
  async resolveClerkIdentity(clerkUserId: string, email: string | null): Promise<UserEntity> {
    const linked = await this.findByClerkUserId(clerkUserId);
    if (linked) return linked;

    if (email) {
      const existing = await this.findByEmail(email);
      if (existing) {
        await this.repo.update(existing.id, {
          clerkUserId,
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
          updatedAt: new Date(),
        });
        existing.clerkUserId = clerkUserId;
        if (!existing.emailVerifiedAt) existing.emailVerifiedAt = new Date();
        return existing;
      }
    }

    const placeholderEmail = email?.trim() ?? `${clerkUserId}@clerk.local`;
    const created = this.repo.create({
      email: placeholderEmail,
      clerkUserId,
      emailVerifiedAt: email ? new Date() : null,
    });
    return this.repo.save(created);
  }

  async suspend(userId: string): Promise<void> {
    await this.repo.update(userId, { status: 'suspended', updatedAt: new Date() });
  }
}
