import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './observability/health.module';
import { PersistenceModule } from './persistence/persistence.module';
import { DomainModule } from './domain/domain.module';
import { ActionEngineModule } from './action-engine/action-engine.module';
import { AccountsModule } from './accounts/accounts.module';
import { XAutomationModule } from './x-automation/x-automation.module';
import { SettingsModule } from './settings/settings.module';
import { ContentMemoryModule } from './content-memory/content-memory.module';
import { AdminApiModule } from './admin-api/admin-api.module';
import { McpModule } from './mcp/mcp.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { AuthModule } from './auth/auth.module';
import { PublicApiModule } from './public-api/public-api.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PersistenceModule,
    DomainModule,
    AccountsModule,
    ActionEngineModule,
    XAutomationModule,
    SettingsModule,
    ContentMemoryModule,
    AuthModule,
    AdminApiModule,
    PublicApiModule,
    McpModule,
    MonitoringModule,
    HealthModule,
  ],
})
export class AppModule {}
