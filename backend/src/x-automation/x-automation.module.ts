import { Module, forwardRef } from '@nestjs/common';
import { ActionEngineModule } from '../action-engine/action-engine.module';
import { AccountsModule } from '../accounts/accounts.module';
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
import { XBrowserService } from './browser/x-browser.service';
import { XPostFlowService } from './browser/x-post-flow.service';
import { SelectorRegistry } from './browser/selector-registry';
import { XDirectService } from './x-direct.service';
import { XLoginService } from './login/x-login.service';
import { LoginJobsRepository } from './login/login-jobs.repository';
import { LoginWorker } from './login/login-worker.service';

/**
 * X otomasyon adapter modülü.
 *
 * Domain `IXActionExecutor` portu Domain'de tanımlı; Patchright bu modülde izole.
 * Hangi executor'ların register edileceği `X_EXECUTOR_MODE` env değişkeniyle kontrol edilir:
 *   - `noop` (varsayılan): NoOp executor'lar (test/dev)
 *   - `patchright`: Gerçek Patchright tabanlı executor'lar (prod)
 */
@Module({
  // ActionEngineModule -> AccountsModule -> XAutomationModule cycle (introduced
  // when ProfileCacheService started depending on XDirectService). forwardRef
  // both ends so Nest can resolve providers across the cycle.
  imports: [forwardRef(() => ActionEngineModule), forwardRef(() => AccountsModule)],
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
    // direct (synchronous) service
    XDirectService,
    // login flow (server-side headless X login)
    XLoginService,
    LoginJobsRepository,
    LoginWorker,
  ],
  exports: [XDirectService, XBrowserService, XLoginService, LoginJobsRepository],
})
export class XAutomationModule {}
