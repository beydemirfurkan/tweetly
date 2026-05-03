import { Module } from '@nestjs/common';
import { AccountsModule } from '@/accounts/accounts.module';
import { ActionEngineModule } from '@/action-engine/action-engine.module';
import { AdminApiModule } from '@/admin-api/admin-api.module';
import { AuthModule } from '@/auth/auth.module';
import { MonitoringModule } from '@/monitoring/monitoring.module';
import { XAutomationModule } from '@/x-automation/x-automation.module';
import { PublicApiController } from './public-api.controller';

@Module({
  imports: [
    AccountsModule,
    ActionEngineModule,
    AdminApiModule,
    AuthModule,
    MonitoringModule,
    XAutomationModule,
  ],
  controllers: [PublicApiController],
})
export class PublicApiModule {}
