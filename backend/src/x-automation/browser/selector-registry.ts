import { Injectable } from '@nestjs/common';

/**
 * X UI selector'ları tek noktada — UI değişikliklerinde tek dosya patch'i yeterli.
 * Faz 3 minimum: post + reply için olanlar; Faz 5'te like/retweet/follow/quote/bookmark için
 * yeni alanlar eklenecek.
 */
@Injectable()
export class SelectorRegistry {
  // Composer / post
  readonly composer = '[data-testid="tweetTextarea_0"]';
  readonly postButton = '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]';
  readonly mediaInput = 'input[data-testid="fileInput"]';
  readonly mediaAttached =
    '[data-testid="attachments"], div[aria-label="Image"], div[data-testid="tweetPhoto"]';
  readonly toast = '[data-testid="toast"]';
  readonly tweetArticle = 'article[data-testid="tweet"]';

  // Engagement actions
  readonly likeButton = '[data-testid="like"]';
  readonly unlikeButton = '[data-testid="unlike"]';
  readonly bookmarkButton = '[data-testid="bookmark"]';
  readonly retweetButton = '[data-testid="retweet"]';
  readonly retweetConfirm = '[data-testid="retweetConfirm"]';
  readonly quoteMenuItem = '[data-testid="quoteTweet"]';
  readonly quoteComposer = '[data-testid="tweetTextarea_0"]';

  followButton(handle: string): string {
    return `[data-testid="${handle}-follow"]`;
  }

  unfollowButton(handle: string): string {
    return `[data-testid="${handle}-unfollow"]`;
  }

  // Unretweet
  readonly unretweetConfirm = '[data-testid="unretweetConfirm"]';

  // Delete tweet
  readonly moreActionsButton = '[data-testid="caret"]';

  // DM composer
  readonly dmTextarea = '[data-testid="dmComposerTextInput"]';
  readonly dmSendButton = '[data-testid="dmComposerSendButton"]';
  readonly newDmButton = '[data-testid="NewDM_Button"]';

  // Tweet data selectors (for scraping)
  readonly tweetText = '[data-testid="tweetText"]';
  readonly tweetLikeCount = '[data-testid="like"] span[data-testid="app-text-transition-container"]';
  readonly tweetRetweetCount = '[data-testid="retweet"] span[data-testid="app-text-transition-container"]';
  readonly tweetReplyCount = '[data-testid="reply"] span[data-testid="app-text-transition-container"]';

  // User profile selectors
  readonly userDescription = '[data-testid="UserDescription"]';
  readonly userName = '[data-testid="UserName"]';
  readonly userFollowersCount = 'a[href$="/verified_followers"] span span, a[href$="/followers"] span span';
  readonly userFollowingCount = 'a[href$="/following"] span span';
  readonly userProfileImage = 'a[href$="/photo"] img, img[src*="profile_images"], [data-testid="TweetAvatar"] img';
}
