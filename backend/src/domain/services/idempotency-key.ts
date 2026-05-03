import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class IdempotencyKeyService {
  private sha8(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
  }

  private hourBucket(date: Date): string {
    return date.toISOString().slice(0, 13);
  }

  forPost(accountId: string, text: string, scheduledAt: Date): string {
    return `post:${accountId}:${this.sha8(text)}:${this.hourBucket(scheduledAt)}`;
  }

  forReply(accountId: string, parentTweetId: string, text: string): string {
    return `reply:${accountId}:${parentTweetId}:${this.sha8(text)}`;
  }

  forRetweet(accountId: string, tweetId: string): string {
    return `retweet:${accountId}:${tweetId}`;
  }

  forLike(accountId: string, tweetId: string): string {
    return `like:${accountId}:${tweetId}`;
  }

  forFollow(accountId: string, targetHandle: string): string {
    return `follow:${accountId}:${targetHandle}`;
  }

  forQuote(accountId: string, tweetId: string, text: string): string {
    return `quote:${accountId}:${tweetId}:${this.sha8(text)}`;
  }

  forBookmark(accountId: string, tweetId: string): string {
    return `bookmark:${accountId}:${tweetId}`;
  }

  forUnlike(accountId: string, tweetId: string): string {
    return `unlike:${accountId}:${tweetId}`;
  }

  forUnretweet(accountId: string, tweetId: string): string {
    return `unretweet:${accountId}:${tweetId}`;
  }

  forUnfollow(accountId: string, targetHandle: string): string {
    return `unfollow:${accountId}:${targetHandle}`;
  }

  forDeleteTweet(accountId: string, tweetId: string): string {
    return `delete_tweet:${accountId}:${tweetId}`;
  }

  /**
   * DMs are deduped per (account, recipient, message-hash, hour-bucket): the
   * same exact message to the same person within an hour collapses, but a
   * follow-up message goes through.
   */
  forDm(accountId: string, targetHandle: string, message: string, scheduledAt: Date): string {
    return `dm:${accountId}:${targetHandle}:${this.sha8(message)}:${this.hourBucket(scheduledAt)}`;
  }

  /**
   * Profile updates are deduped on the field set hash so re-submitting the
   * same change is a no-op, but any field difference enqueues again.
   */
  forProfileUpdate(accountId: string, fields: Record<string, unknown>): string {
    return `profile_update:${accountId}:${this.sha8(JSON.stringify(fields))}`;
  }

  forAvatarUpdate(accountId: string, filePath: string): string {
    return `avatar_update:${accountId}:${this.sha8(filePath)}`;
  }

  forBannerUpdate(accountId: string, filePath: string): string {
    return `banner_update:${accountId}:${this.sha8(filePath)}`;
  }
}
