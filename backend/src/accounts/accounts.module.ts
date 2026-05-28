import { Module } from '@nestjs/common';
import { AccountProfilesModule } from './account-profiles.module';
import { AccountsCoreModule } from './accounts-core.module';

@Module({
  imports: [AccountsCoreModule, AccountProfilesModule],
  exports: [AccountsCoreModule, AccountProfilesModule],
})
export class AccountsModule {}
