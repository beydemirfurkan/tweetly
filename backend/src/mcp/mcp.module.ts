import { Module } from '@nestjs/common';
import { AccountsModule } from '@/accounts/accounts.module';
import { ActionEngineModule } from '@/action-engine/action-engine.module';
import { SettingsModule } from '@/settings/settings.module';
import { AuthModule } from '@/auth/auth.module';
import { XBrowserModule } from '@/x-automation/browser/browser.module';
import { XDirectModule } from '@/x-automation/x-direct/x-direct.module';
import { XLoginModule } from '@/x-automation/login/x-login.module';
import { MonitoringModule } from '@/monitoring/monitoring.module';
import { ExtractionsModule } from '@/extractions/extractions.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpSessionRouter } from './mcp-session-router.service';
import { McpRouter } from './mcp-router.service';
import { McpToolBindings } from './mcp-tool-bindings';
import { WriteHandler } from './handlers/write.handler';
import { ProfileHandler } from './handlers/profile.handler';
import { ReadHandler } from './handlers/read.handler';
import { MonitorHandler } from './handlers/monitor.handler';
import { AccountInfoHandler } from './handlers/account-info.handler';
import { LoginHandler } from './handlers/login.handler';
import { ActionQueueHandler } from './handlers/action-queue.handler';
import { AccountSettingsHandler } from './handlers/account-settings.handler';
import { ExtractionHandler } from './handlers/extraction.handler';

@Module({
  imports: [
    AccountsModule,
    ActionEngineModule,
    SettingsModule,
    AuthModule,
    XBrowserModule,
    XDirectModule,
    XLoginModule,
    MonitoringModule,
    ExtractionsModule,
  ],
  controllers: [McpController],
  providers: [
    McpService,
    McpSessionRouter,
    McpRouter,
    McpToolBindings,
    WriteHandler,
    ProfileHandler,
    ReadHandler,
    MonitorHandler,
    AccountInfoHandler,
    LoginHandler,
    ActionQueueHandler,
    AccountSettingsHandler,
    ExtractionHandler,
  ],
})
export class McpModule {}
