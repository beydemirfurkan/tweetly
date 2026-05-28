import { Module } from '@nestjs/common';
import { SettingsModule } from '@/settings/settings.module';
import { AuthModule } from '@/auth/auth.module';
import { ActionEngineModule } from '@/action-engine/action-engine.module';
import { XBrowserModule } from '@/x-automation/browser/browser.module';
import { XDirectModule } from '@/x-automation/x-direct/x-direct.module';
import { AdminApiController } from './admin-api.controller';
import { AdminApiService } from './admin-api.service';
import { AdminTokenGuard } from './admin-token.guard';

@Module({
  imports: [SettingsModule, AuthModule, ActionEngineModule, XBrowserModule, XDirectModule],
  controllers: [AdminApiController],
  providers: [AdminApiService, AdminTokenGuard],
  exports: [AdminTokenGuard, SettingsModule],
})
export class AdminApiModule {}
