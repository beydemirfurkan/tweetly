import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountProfileEntity } from '@persistence/entities/account-profile.entity';
import { ProfileFetcherModule } from '@/x-automation/profile-fetcher/profile-fetcher.module';
import { ProfileCacheService } from './profile-cache.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountProfileEntity]),
    ProfileFetcherModule,
  ],
  providers: [ProfileCacheService],
  exports: [ProfileCacheService],
})
export class AccountProfilesModule {}
