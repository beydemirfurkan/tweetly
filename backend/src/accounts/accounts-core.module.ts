import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '@persistence/entities/account.entity';
import { ControlStateRepository } from '@persistence/repositories/control-state.repository';
import { ActionAdminRepository } from '@persistence/repositories/action-admin.repository';
import { AccountAccessService } from './application/account-access.service';
import { AccountOwnershipService } from './account-ownership.service';
import { AccountsService } from './accounts.service';

@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity])],
  providers: [
    AccountsService,
    ControlStateRepository,
    AccountOwnershipService,
    AccountAccessService,
    ActionAdminRepository,
  ],
  exports: [AccountsService, AccountOwnershipService, AccountAccessService],
})
export class AccountsCoreModule {}
