import { Module } from '@nestjs/common';
import { XBrowserModule } from './browser/browser.module';
import { XDirectModule } from './x-direct/x-direct.module';
import { XExecutorsModule } from './executors/x-executors.module';
import { XLoginModule } from './login/x-login.module';

/**
 * X automation composition module. Browser, direct, login, and executor
 * providers live in focused submodules. PROFILE_FETCHER is bound explicitly by
 * ProfileFetcherModule, which AccountProfilesModule imports without relying on
 * global DI.
 */
@Module({
  imports: [XBrowserModule, XDirectModule, XLoginModule, XExecutorsModule],
  exports: [XBrowserModule, XDirectModule, XLoginModule],
})
export class XAutomationModule {}
