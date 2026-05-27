import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountStyleProfileEntity } from '@persistence/entities/account-style-profile.entity';
import { ProfileAnalyzerService } from '@/ai-copilot/services/profile-analyzer.service';

export interface UpdateStyleProfileInput {
  customInstructions?: string;
  tweetLanguage?: string;
}

@Injectable()
export class StyleProfileService {
  private readonly logger = new Logger(StyleProfileService.name);

  constructor(
    @InjectRepository(AccountStyleProfileEntity)
    private readonly repo: Repository<AccountStyleProfileEntity>,
    private readonly profileAnalyzer: ProfileAnalyzerService,
  ) {}

  async findByAccountId(accountId: string): Promise<AccountStyleProfileEntity | null> {
    return this.repo.findOne({ where: { accountId } });
  }

  async upsert(
    accountId: string,
    input: UpdateStyleProfileInput,
  ): Promise<AccountStyleProfileEntity> {
    let profile = await this.repo.findOne({ where: { accountId } });

    if (!profile) {
      profile = this.repo.create({ accountId });
    }

    if (input.customInstructions !== undefined) {
      profile.customInstructions = input.customInstructions;
    }
    if (input.tweetLanguage !== undefined) {
      profile.tweetLanguage = input.tweetLanguage;
    }

    return this.repo.save(profile);
  }

  async analyzeAndSave(accountId: string, handle: string): Promise<AccountStyleProfileEntity> {
    this.logger.log(`Analyzing style profile for @${handle} (account: ${accountId})`);

    const analysis = await this.profileAnalyzer.analyzeProfile(handle, accountId);

    let profile = await this.repo.findOne({ where: { accountId } });
    if (!profile) {
      profile = this.repo.create({ accountId });
    }

    profile.styleProfile = analysis.styleProfile as unknown as Record<string, unknown>;
    profile.analyzedAt = new Date();

    return this.repo.save(profile);
  }

  async getEffectiveStyle(accountId: string): Promise<{
    styleProfile: Record<string, unknown> | null;
    customInstructions: string;
    tweetLanguage: string;
  }> {
    const profile = await this.repo.findOne({ where: { accountId } });

    return {
      styleProfile: profile?.styleProfile ?? null,
      customInstructions: profile?.customInstructions ?? '',
      tweetLanguage: profile?.tweetLanguage ?? 'tr',
    };
  }
}
