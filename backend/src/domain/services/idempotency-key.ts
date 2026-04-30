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
}
