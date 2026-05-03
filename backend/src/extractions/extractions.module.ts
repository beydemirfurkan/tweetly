import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { AccountsModule } from '@/accounts/accounts.module';
import { AdminApiModule } from '@/admin-api/admin-api.module';
import { CryptoModule } from '@/common/crypto/crypto.module';
import { XAutomationModule } from '@/x-automation/x-automation.module';
import { LoginJobsRepository } from '@/x-automation/login/login-jobs.repository';
import { AccountFacade } from '@/public-api/facades/account.facade';
import { ExtractionJobsRepository } from './extraction-jobs.repository';
import { ExtractionService } from './extraction.service';
import { ExtractionWorker } from './extraction-worker.service';
import { ExtractionsController } from './extractions.controller';

@Module({
  imports: [
    AccountsModule,
    AdminApiModule,
    AuthModule,
    CryptoModule,
    XAutomationModule,
  ],
  controllers: [ExtractionsController],
  providers: [
    AccountFacade,
    LoginJobsRepository,
    ExtractionJobsRepository,
    ExtractionService,
    ExtractionWorker,
  ],
  exports: [ExtractionService, ExtractionJobsRepository],
})
export class ExtractionsModule {}
