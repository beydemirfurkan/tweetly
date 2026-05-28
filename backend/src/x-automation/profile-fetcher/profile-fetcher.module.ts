import { Module } from '@nestjs/common';
import { PROFILE_FETCHER } from '@domain/ports/profile-fetcher.port';
import { XDirectProfileFetcherAdapter } from '../x-direct/x-direct-profile-fetcher.adapter';
import { XDirectModule } from '../x-direct/x-direct.module';

@Module({
  imports: [XDirectModule],
  providers: [
    { provide: PROFILE_FETCHER, useExisting: XDirectProfileFetcherAdapter },
  ],
  exports: [PROFILE_FETCHER],
})
export class ProfileFetcherModule {}
