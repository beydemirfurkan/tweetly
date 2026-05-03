import { Module } from '@nestjs/common';
import { SettingsModule } from '@/settings/settings.module';
import { AuthModule } from '@/auth/auth.module';
import { ActionEngineModule } from '@/action-engine/action-engine.module';
import { XAutomationModule } from '@/x-automation/x-automation.module';
import { ActionAdminRepository } from '@persistence/repositories';
import { AdminApiController } from './admin-api.controller';
import { AdminApiService } from './admin-api.service';
import { AdminTokenGuard } from './admin-token.guard';

@Module({
  imports: [SettingsModule, AuthModule, ActionEngineModule, XAutomationModule],
  controllers: [AdminApiController],
  providers: [AdminApiService, AdminTokenGuard, ActionAdminRepository],
  exports: [AdminApiService, AdminTokenGuard, SettingsModule],
})
export class AdminApiModule {}
