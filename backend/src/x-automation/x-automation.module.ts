import { Global, Module } from '@nestjs/common';
import { ActionEngineModule } from '@/action-engine/action-engine.module';
import { AccountsModule } from '@/accounts/accounts.module';
import { PROFILE_FETCHER } from '@domain/ports/profile-fetcher.port';
import { NoOpPostExecutor } from './executors/noop-post.executor';
import { NoOpReplyExecutor } from './executors/noop-reply.executor';
import { NoOpLikeExecutor } from './executors/noop-like.executor';
import { NoOpBookmarkExecutor } from './executors/noop-bookmark.executor';
import { NoOpRetweetExecutor } from './executors/noop-retweet.executor';
import { NoOpFollowExecutor } from './executors/noop-follow.executor';
import { NoOpQuoteExecutor } from './executors/noop-quote.executor';
import { PatchrightPostExecutor } from './executors/patchright-post.executor';
import { PatchrightReplyExecutor } from './executors/patchright-reply.executor';
import { PatchrightLikeExecutor } from './executors/patchright-like.executor';
import { PatchrightBookmarkExecutor } from './executors/patchright-bookmark.executor';
import { PatchrightRetweetExecutor } from './executors/patchright-retweet.executor';
import { PatchrightFollowExecutor } from './executors/patchright-follow.executor';
import { PatchrightQuoteExecutor } from './executors/patchright-quote.executor';
import { UnlikeExecutor } from './executors/unlike.executor';
import { UnretweetExecutor } from './executors/unretweet.executor';
import { UnfollowExecutor } from './executors/unfollow.executor';
import { DeleteTweetExecutor } from './executors/delete-tweet.executor';
import { DmExecutor } from './executors/dm.executor';
import { ProfileUpdateExecutor } from './executors/profile-update.executor';
import { AvatarUpdateExecutor } from './executors/avatar-update.executor';
import { BannerUpdateExecutor } from './executors/banner-update.executor';
import { XBrowserService } from './browser/x-browser.service';
import { XPostFlowService } from './browser/x-post-flow.service';
import { SelectorRegistry } from './browser/selector-registry';
import { XDirectReadService, XDirectWriteService, XDirectProfileService } from './x-direct';
import { XDirectProfileFetcherAdapter } from './x-direct/x-direct-profile-fetcher.adapter';
import { XLoginService } from './login/x-login.service';
import { LoginJobsRepository } from './login/login-jobs.repository';
import { LoginWorker } from './login/login-worker.service';
import { CookieHealthCheckService } from './login/cookie-health-check.service';
import { LoginProfileCleanupService } from './login/login-profile-cleanup.service';

/**
 * X automation adapter module.
 *
 * `@Global()` so the PROFILE_FETCHER port binding is visible to
 * AccountsModule.ProfileCacheService without AccountsModule importing this
 * module — that's what kills the previous accounts ↔ x-automation cycle.
 *
 * The domain `IXActionExecutor` port is defined in Domain; Patchright stays
 * isolated to this module. Which executors get registered is controlled by
 * the `X_EXECUTOR_MODE` env var:
 *   - `noop` (default): NoOp executors (test/dev)
 *   - `patchright`: real Patchright-backed executors (prod)
 */
@Global()
@Module({
  imports: [ActionEngineModule, AccountsModule],
  providers: [
    SelectorRegistry,
    XBrowserService,
    XPostFlowService,
    // noop executors (dev/test)
    NoOpPostExecutor,
    NoOpReplyExecutor,
    NoOpLikeExecutor,
    NoOpBookmarkExecutor,
    NoOpRetweetExecutor,
    NoOpFollowExecutor,
    NoOpQuoteExecutor,
    // patchright executors (prod)
    PatchrightPostExecutor,
    PatchrightReplyExecutor,
    PatchrightLikeExecutor,
    PatchrightBookmarkExecutor,
    PatchrightRetweetExecutor,
    PatchrightFollowExecutor,
    PatchrightQuoteExecutor,
    // queue-backed executors for previously synchronous writes (registered in
    // both modes — they wrap the x-direct services which implement the noop
    // dry-run path, so a single executor class covers dev and prod).
    UnlikeExecutor,
    UnretweetExecutor,
    UnfollowExecutor,
    DeleteTweetExecutor,
    DmExecutor,
    ProfileUpdateExecutor,
    AvatarUpdateExecutor,
    BannerUpdateExecutor,
    // direct (synchronous) services — read / write / profile
    XDirectReadService,
    XDirectWriteService,
    XDirectProfileService,
    // PROFILE_FETCHER port binding — adapter wraps XDirectReadService.getUser
    // so accounts can refresh profiles without importing this module.
    { provide: PROFILE_FETCHER, useClass: XDirectProfileFetcherAdapter },
    XDirectProfileFetcherAdapter,
    // login flow (server-side headless X login)
    XLoginService,
    LoginJobsRepository,
    LoginWorker,
    CookieHealthCheckService,
    LoginProfileCleanupService,
  ],
  exports: [
    XDirectReadService,
    XDirectWriteService,
    XDirectProfileService,
    XBrowserService,
    XLoginService,
    LoginJobsRepository,
    CookieHealthCheckService,
    PROFILE_FETCHER,
  ],
})
export class XAutomationModule {}
