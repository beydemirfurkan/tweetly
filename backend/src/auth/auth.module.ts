import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../persistence/entities/user.entity';
import { ApiKeyEntity } from '../persistence/entities/api-key.entity';
import { MagicLinkEntity } from '../persistence/entities/magic-link.entity';
import { UsersService } from './users.service';
import { ApiKeyService } from './api-key.service';
import { MagicLinkService } from './magic-link.service';
import { ApiKeyGuard } from './api-key.guard';
import { AuthController } from './auth.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, ApiKeyEntity, MagicLinkEntity])],
  controllers: [AuthController],
  providers: [UsersService, ApiKeyService, MagicLinkService, ApiKeyGuard],
  exports: [UsersService, ApiKeyService, ApiKeyGuard],
})
export class AuthModule {}
