import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '@persistence/entities/user.entity';
import { ApiKeyEntity } from '@persistence/entities/api-key.entity';
import { MagicLinkEntity } from '@persistence/entities/magic-link.entity';
import { SettingsModule } from '@/settings/settings.module';
import { UsersService } from './users.service';
import { ApiKeyService } from './api-key.service';
import { MagicLinkService } from './magic-link.service';
import { ApiKeyGuard } from './api-key.guard';
import { AuthController } from './auth.controller';
import { TieredThrottlerGuard } from './tiered-throttler.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, ApiKeyEntity, MagicLinkEntity]),
    SettingsModule,
  ],
  controllers: [AuthController],
  providers: [UsersService, ApiKeyService, MagicLinkService, ApiKeyGuard, TieredThrottlerGuard],
  exports: [UsersService, ApiKeyService, MagicLinkService, ApiKeyGuard, TieredThrottlerGuard],
})
export class AuthModule {}
