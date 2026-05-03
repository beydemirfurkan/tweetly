import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '@persistence/entities/user.entity';
import { ApiKeyEntity } from '@persistence/entities/api-key.entity';
import { SettingsModule } from '@/settings/settings.module';
import { UsersService } from './users.service';
import { ApiKeyService } from './api-key.service';
import { ClerkTokenService } from './clerk-token.service';
import { ApiKeyGuard } from './api-key.guard';
import { AuthController } from './auth.controller';
import { ClerkWebhookController } from './clerk-webhook.controller';
import { TieredThrottlerGuard } from './tiered-throttler.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, ApiKeyEntity]),
    SettingsModule,
  ],
  controllers: [AuthController, ClerkWebhookController],
  providers: [UsersService, ApiKeyService, ClerkTokenService, ApiKeyGuard, TieredThrottlerGuard],
  exports: [UsersService, ApiKeyService, ClerkTokenService, ApiKeyGuard, TieredThrottlerGuard],
})
export class AuthModule {}
