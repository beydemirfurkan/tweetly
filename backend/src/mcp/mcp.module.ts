import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { ActionEngineModule } from '../action-engine/action-engine.module';
import { SettingsModule } from '../settings/settings.module';
import { AdminApiModule } from '../admin-api/admin-api.module';
import { AuthModule } from '../auth/auth.module';
import { XAutomationModule } from '../x-automation/x-automation.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpSessionRouter } from './mcp-session-router.service';

@Module({
  imports: [
    AdminApiModule,
    AccountsModule,
    ActionEngineModule,
    SettingsModule,
    AuthModule,
    XAutomationModule,
    MonitoringModule,
  ],
  controllers: [McpController],
  providers: [McpService, McpSessionRouter],
})
export class McpModule {}
