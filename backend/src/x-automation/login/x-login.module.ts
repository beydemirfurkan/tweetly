import { Module } from '@nestjs/common';
import { AccountProfilesModule } from '@/accounts/account-profiles.module';
import { AccountsCoreModule } from '@/accounts/accounts-core.module';
import { CryptoModule } from '@/common/crypto/crypto.module';
import { WorkersModule } from '@/common/workers/workers.module';
import { CookieHealthCheckService } from './cookie-health-check.service';
import { LoginJobsRepository } from './login-jobs.repository';
import { LoginProfileCleanupService } from './login-profile-cleanup.service';
import { LoginWorker } from './login-worker.service';
import { XLoginService } from './x-login.service';

@Module({
  imports: [AccountsCoreModule, AccountProfilesModule, CryptoModule, WorkersModule],
  providers: [
    XLoginService,
    LoginJobsRepository,
    LoginWorker,
    CookieHealthCheckService,
    LoginProfileCleanupService,
  ],
  exports: [XLoginService, LoginJobsRepository, CookieHealthCheckService],
})
export class XLoginModule {}
