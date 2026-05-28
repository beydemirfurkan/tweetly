import { Module } from '@nestjs/common';
import { ActionEngineModule } from '@/action-engine/action-engine.module';
import { XBrowserModule } from '../browser/browser.module';
import { XDirectModule } from '../x-direct/x-direct.module';
import { AvatarUpdateExecutor } from './avatar-update.executor';
import { BannerUpdateExecutor } from './banner-update.executor';
import { DeleteTweetExecutor } from './delete-tweet.executor';
import { DmExecutor } from './dm.executor';
import { NoOpBookmarkExecutor } from './noop-bookmark.executor';
import { NoOpFollowExecutor } from './noop-follow.executor';
import { NoOpLikeExecutor } from './noop-like.executor';
import { NoOpPostExecutor } from './noop-post.executor';
import { NoOpQuoteExecutor } from './noop-quote.executor';
import { NoOpReplyExecutor } from './noop-reply.executor';
import { NoOpRetweetExecutor } from './noop-retweet.executor';
import { PatchrightBookmarkExecutor } from './patchright-bookmark.executor';
import { PatchrightFollowExecutor } from './patchright-follow.executor';
import { PatchrightLikeExecutor } from './patchright-like.executor';
import { PatchrightPostExecutor } from './patchright-post.executor';
import { PatchrightQuoteExecutor } from './patchright-quote.executor';
import { PatchrightReplyExecutor } from './patchright-reply.executor';
import { PatchrightRetweetExecutor } from './patchright-retweet.executor';
import { ProfileUpdateExecutor } from './profile-update.executor';
import { UnfollowExecutor } from './unfollow.executor';
import { UnlikeExecutor } from './unlike.executor';
import { UnretweetExecutor } from './unretweet.executor';

const EXECUTOR_PROVIDERS = [
  NoOpPostExecutor,
  NoOpReplyExecutor,
  NoOpLikeExecutor,
  NoOpBookmarkExecutor,
  NoOpRetweetExecutor,
  NoOpFollowExecutor,
  NoOpQuoteExecutor,
  PatchrightPostExecutor,
  PatchrightReplyExecutor,
  PatchrightLikeExecutor,
  PatchrightBookmarkExecutor,
  PatchrightRetweetExecutor,
  PatchrightFollowExecutor,
  PatchrightQuoteExecutor,
  UnlikeExecutor,
  UnretweetExecutor,
  UnfollowExecutor,
  DeleteTweetExecutor,
  DmExecutor,
  ProfileUpdateExecutor,
  AvatarUpdateExecutor,
  BannerUpdateExecutor,
];

@Module({
  imports: [ActionEngineModule, XBrowserModule, XDirectModule],
  providers: EXECUTOR_PROVIDERS,
})
export class XExecutorsModule {}
