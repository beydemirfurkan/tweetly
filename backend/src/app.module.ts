import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { HealthModule } from './observability/health.module';
import { LoggerModule } from './observability/logger.module';
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
import { OAuthModule } from './oauth/oauth.module';
import { PublicApiModule } from './public-api/public-api.module';
import { ExtractionsModule } from './extractions/extractions.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { ContextModule } from './common/context';
import { AiCopilotModule } from './ai-copilot/ai-copilot.module';
import { AgentModule } from './agent/agent.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const throttlers = [{ name: 'default', ttl: 60_000, limit: 30 }];
        const url = process.env.REDIS_URL;
        if (!url) {
          Logger.log(
            'REDIS_URL not set — throttler using in-memory storage (single-instance only)',
            'AppModule',
          );
          return { throttlers };
        }
        const redis = new Redis(url, {
          // ioredis retry storm guard: cap at ~30s between retries.
          maxRetriesPerRequest: 3,
          enableReadyCheck: false,
          lazyConnect: false,
        });
        redis.on('error', (err) =>
          Logger.warn(`Redis throttler client error: ${err.message}`, 'AppModule'),
        );
        Logger.log(`Throttler using Redis at ${url}`, 'AppModule');
        return {
          throttlers,
          storage: new ThrottlerStorageRedisService(redis),
        };
      },
    }),
    LoggerModule,
    ContextModule,
    CryptoModule,
    PersistenceModule,
    DomainModule,
    AccountsModule,
    ActionEngineModule,
    XAutomationModule,
    SettingsModule,
    ContentMemoryModule,
    AuthModule,
    OAuthModule,
    AdminApiModule,
    PublicApiModule,
    ExtractionsModule,
    McpModule,
    MonitoringModule,
    HealthModule,
    AiCopilotModule,
    AgentModule,
  ],
})
export class AppModule {}
