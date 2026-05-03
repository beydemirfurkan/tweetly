import { Injectable } from '@nestjs/common';

/**
 * X UI selectors — single source of truth. Patch here when X DOM changes.
 */
@Injectable()
export class SelectorRegistry {
  // Composer / post
  readonly composer = '[data-testid="tweetTextarea_0"]';
  readonly postButton = '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]';
  readonly mediaInput = 'input[data-testid="fileInput"]';
  readonly mediaAttached =
    '[data-testid="attachments"], div[aria-label="Image"], div[data-testid="tweetPhoto"]';
  // Per-attached-media UI: each thumbnail has an "ALT" button which opens a
  // modal with a textarea + Save. These are best-effort; alt text upload
  // failures should not block the post itself.
  readonly mediaAltButton = '[data-testid="attachments"] [aria-label*="Add description" i], [data-testid="altTextButton"]';
  readonly mediaAltTextarea = 'textarea[aria-label*="Image description" i], textarea[name="altText"]';
  readonly mediaAltSave = '[data-testid="applyButton"]';

  // Profile photo / banner editing on /settings/profile (best-effort selectors;
  // X reshuffles these periodically — patch here when avatar/banner uploads
  // start failing).
  readonly profilePhotoButton =
    '[data-testid="ProfileAvatarFileInput-FileInput"], button[aria-label*="profile photo" i], button[aria-label*="Add avatar" i]';
  readonly profileBannerButton =
    '[data-testid="HeaderPhotoFileInput-FileInput"], button[aria-label*="banner" i], button[aria-label*="header photo" i]';
  readonly profileFileInputs = 'input[type="file"][accept*="image"]';
  readonly profileApplyButton = '[data-testid="applyButton"]';
  readonly profileSaveButton =
    '[data-testid="Profile_Save_Button"], [data-testid="settingsDetailSave"]';
  readonly toast = '[data-testid="toast"]';
  readonly tweetArticle = 'article[data-testid="tweet"]';

  // Engagement actions
  readonly likeButton = '[data-testid="like"]';
  readonly unlikeButton = '[data-testid="unlike"]';
  readonly bookmarkButton = '[data-testid="bookmark"]';
  readonly retweetButton = '[data-testid="retweet"]';
  readonly retweetConfirm = '[data-testid="retweetConfirm"]';
  // Quote-tweet flow may land on either the retweet or unretweet variant
  // depending on whether the current account already retweeted; both open
  // the same menu where "Quote" lives.
  readonly retweetOrUnretweetButton = '[data-testid="retweet"], [data-testid="unretweet"]';
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

  // Generic confirmation sheet (used by unfollow, delete tweet, …)
  readonly confirmationSheetConfirm = '[data-testid="confirmationSheetConfirm"]';

  // DM composer
  readonly dmTextarea = '[data-testid="dmComposerTextInput"]';
  readonly dmSendButton = '[data-testid="dmComposerSendButton"]';
  readonly newDmButton = '[data-testid="NewDM_Button"]';
  readonly dmFromProfileButton = '[data-testid="sendDMFromProfile"]';

  // Profile edit form fields
  readonly profileNameInput = 'input[name="displayName"]';
  readonly profileBioTextarea = 'textarea[name="description"]';
  readonly profileLocationInput = 'input[name="location"]';
  readonly profileWebsiteInput = 'input[name="url"]';

  // User cell (search/list rows)
  readonly userCell = '[data-testid="UserCell"]';

  // Tweet data selectors (for scraping)
  readonly tweetText = '[data-testid="tweetText"]';
  readonly tweetLikeCount = '[data-testid="like"] span[data-testid="app-text-transition-container"]';
  readonly tweetRetweetCount = '[data-testid="retweet"] span[data-testid="app-text-transition-container"]';
  readonly tweetReplyCount = '[data-testid="reply"] span[data-testid="app-text-transition-container"]';

  // User profile selectors
  readonly userDescription = '[data-testid="UserDescription"]';
  readonly userName = '[data-testid="UserName"]';
  readonly userNames = '[data-testid="User-Names"] span';
  readonly verifiedIcon = 'svg[data-testid="icon-verified"]';
  readonly trend = '[data-testid="trend"]';
  readonly userFollowersCount = 'a[href$="/verified_followers"] span span, a[href$="/followers"] span span';
  readonly userFollowingCount = 'a[href$="/following"] span span';
  readonly userProfileImage = 'a[href$="/photo"] img, img[src*="profile_images"], [data-testid="TweetAvatar"] img';
}
