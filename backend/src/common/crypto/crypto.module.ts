import { Global, Module } from '@nestjs/common';
import { CredentialCipherService, loadMasterKeyFromEnv } from './credential-cipher.service';

@Global()
@Module({
  providers: [
    {
      provide: CredentialCipherService,
      // Factory bypasses DI for the Buffer constructor arg — Nest would
      // otherwise try (and fail) to resolve `Buffer` as a provider.
      useFactory: () => new CredentialCipherService(loadMasterKeyFromEnv()),
    },
  ],
  exports: [CredentialCipherService],
})
export class CryptoModule {}
