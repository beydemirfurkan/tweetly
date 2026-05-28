import { Module } from '@nestjs/common';
import { AccountsCoreModule } from '@/accounts/accounts-core.module';
import { XBrowserModule } from '../browser/browser.module';
import { XDirectProfileFetcherAdapter } from './x-direct-profile-fetcher.adapter';
import { XDirectProfileService } from './x-direct-profile.service';
import { XDirectReadService } from './x-direct-read.service';
import { XDirectWriteService } from './x-direct-write.service';

@Module({
  imports: [AccountsCoreModule, XBrowserModule],
  providers: [
    XDirectReadService,
    XDirectWriteService,
    XDirectProfileService,
    XDirectProfileFetcherAdapter,
  ],
  exports: [
    XDirectReadService,
    XDirectWriteService,
    XDirectProfileService,
    XDirectProfileFetcherAdapter,
  ],
})
export class XDirectModule {}
