import { Module } from '@nestjs/common';
import { AccountsCoreModule } from '@/accounts/accounts-core.module';
import { BrowserConfigService } from './browser-config';
import { BrowserDiagnosticsService } from './browser-diagnostics.service';
import { BrowserProbeService } from './browser-probe.service';
import { CookieInjectorService } from './cookie-injector.service';
import { ProfileTweetReaderService } from './profile-tweet-reader.service';
import { SelectorRegistry } from './selector-registry';
import { XBrowserService } from './x-browser.service';
import { XPostFlowService } from './x-post-flow.service';

@Module({
  imports: [AccountsCoreModule],
  providers: [
    SelectorRegistry,
    BrowserConfigService,
    CookieInjectorService,
    XBrowserService,
    BrowserDiagnosticsService,
    BrowserProbeService,
    ProfileTweetReaderService,
    XPostFlowService,
  ],
  exports: [
    SelectorRegistry,
    XBrowserService,
    BrowserDiagnosticsService,
    BrowserProbeService,
    ProfileTweetReaderService,
    XPostFlowService,
  ],
})
export class XBrowserModule {}
