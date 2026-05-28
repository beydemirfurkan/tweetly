import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service';

/**
 * Global wrapper around @nestjs/config's ConfigService. AppModule already
 * registers `ConfigModule.forRoot({ isGlobal: true })`, so the underlying
 * ConfigService is available everywhere; this @Global module just adds
 * our typed AppConfigService to the same scope.
 */
@Global()
@Module({
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
