import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthClientEntity } from '@persistence/entities/oauth-client.entity';
import { AuthModule } from '@/auth/auth.module';
import { WellKnownController } from './well-known.controller';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { OAuthCodeStore } from './oauth-code-store.service';
import { OAuthCredentialHasher } from './credential-hasher.service';
import { PkceVerifier } from './pkce-verifier.service';

@Module({
  imports: [TypeOrmModule.forFeature([OAuthClientEntity]), AuthModule],
  controllers: [WellKnownController, OAuthController],
  providers: [OAuthService, OAuthCodeStore, OAuthCredentialHasher, PkceVerifier],
  exports: [OAuthService],
})
export class OAuthModule {}
