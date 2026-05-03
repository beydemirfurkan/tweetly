import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '@persistence/entities/account.entity';
import { AccountProfileEntity } from '@persistence/entities/account-profile.entity';
import { AccountsService } from './accounts.service';
import { ProfileCacheService } from './profile-cache.service';

@Module({
  // No XAutomationModule import — ProfileCacheService consumes the
  // PROFILE_FETCHER port, whose implementation is provided in
  // XAutomationModule. The previous accounts ↔ x-automation cycle is gone.
  imports: [TypeOrmModule.forFeature([AccountEntity, AccountProfileEntity])],
  providers: [AccountsService, ProfileCacheService],
  exports: [AccountsService, ProfileCacheService],
})
export class AccountsModule {}
