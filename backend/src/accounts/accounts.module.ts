import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '@persistence/entities/account.entity';
import { AccountProfileEntity } from '@persistence/entities/account-profile.entity';
import { AccountsService } from './accounts.service';
import { ProfileCacheService } from './profile-cache.service';
import { XAutomationModule } from '@/x-automation/x-automation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountEntity, AccountProfileEntity]),
    forwardRef(() => XAutomationModule),
  ],
  providers: [AccountsService, ProfileCacheService],
  exports: [AccountsService, ProfileCacheService],
})
export class AccountsModule {}
