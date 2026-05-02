import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ACTION_TABLE_CONFIG, GenericActionRepository } from './repositories/action-repository';
import { IdempotencyKeyService } from '../domain/services/idempotency-key';

export interface EnqueuePostInput {
  accountId: string;
  text: string;
  mediaPath?: string | null;
  mediaPaths?: string[] | null;
  altTexts?: string[] | null;
  scheduledAt: Date;
  metadata?: Record<string, unknown>;
  maxAttempts?: number;
}

export interface EnqueueReplyInput {
  accountId: string;
  text: string;
  parentTweetUrl: string;
  scheduledAt: Date;
  parentActionRef?: string | null;
  metadata?: Record<string, unknown>;
  maxAttempts?: number;
}

export interface EnqueueEngagementInput {
  accountId: string;
  targetTweetUrl: string;
  scheduledAt: Date;
  metadata?: Record<string, unknown>;
  maxAttempts?: number;
}

export interface EnqueueFollowInput {
  accountId: string;
  targetHandle: string;
  scheduledAt: Date;
  metadata?: Record<string, unknown>;
  maxAttempts?: number;
}

export interface EnqueueQuoteInput {
  accountId: string;
  text: string;
  targetTweetUrl: string;
  scheduledAt: Date;
  metadata?: Record<string, unknown>;
  maxAttempts?: number;
}

@Injectable()
export class ActionEnqueueService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly keys: IdempotencyKeyService,
  ) {}

  async enqueuePost(input: EnqueuePostInput): Promise<{ id: string | null; idempotencyKey: string }> {
    const repo = new GenericActionRepository(this.dataSource, ACTION_TABLE_CONFIG.post);
    const idempotencyKey = this.keys.forPost(input.accountId, input.text, input.scheduledAt);
    const id = await repo.insertIfAbsent({
      idempotencyKey,
      accountId: input.accountId,
      scheduledAt: input.scheduledAt,
      maxAttempts: input.maxAttempts,
      metadata: input.metadata,
      typeSpecific: {
        text: input.text,
        media_path: input.mediaPath ?? (input.mediaPaths?.[0] ?? null),
        media_paths: input.mediaPaths && input.mediaPaths.length > 0 ? input.mediaPaths : null,
        alt_texts: input.altTexts && input.altTexts.length > 0 ? input.altTexts : null,
      },
    });
    return { id, idempotencyKey };
  }

  async enqueueReply(input: EnqueueReplyInput): Promise<{ id: string | null; idempotencyKey: string }> {
    const repo = new GenericActionRepository(this.dataSource, ACTION_TABLE_CONFIG.reply);
    const parentTweetId = this.parseTweetId(input.parentTweetUrl);
    const idempotencyKey = this.keys.forReply(input.accountId, parentTweetId, input.text);
    const id = await repo.insertIfAbsent({
      idempotencyKey,
      accountId: input.accountId,
      scheduledAt: input.scheduledAt,
      maxAttempts: input.maxAttempts,
      parentActionRef: input.parentActionRef ?? null,
      metadata: input.metadata,
      typeSpecific: {
        text: input.text,
        parent_tweet_url: input.parentTweetUrl,
      },
    });
    return { id, idempotencyKey };
  }

  async enqueueLike(input: EnqueueEngagementInput): Promise<{ id: string | null; idempotencyKey: string }> {
    const repo = new GenericActionRepository(this.dataSource, ACTION_TABLE_CONFIG.like);
    const tweetId = this.parseTweetId(input.targetTweetUrl);
    const idempotencyKey = this.keys.forLike(input.accountId, tweetId);
    const id = await repo.insertIfAbsent({
      idempotencyKey,
      accountId: input.accountId,
      scheduledAt: input.scheduledAt,
      maxAttempts: input.maxAttempts,
      metadata: input.metadata,
      typeSpecific: { target_tweet_url: input.targetTweetUrl, target_tweet_id: tweetId },
    });
    return { id, idempotencyKey };
  }

  async enqueueBookmark(input: EnqueueEngagementInput): Promise<{ id: string | null; idempotencyKey: string }> {
    const repo = new GenericActionRepository(this.dataSource, ACTION_TABLE_CONFIG.bookmark);
    const tweetId = this.parseTweetId(input.targetTweetUrl);
    const idempotencyKey = this.keys.forBookmark(input.accountId, tweetId);
    const id = await repo.insertIfAbsent({
      idempotencyKey,
      accountId: input.accountId,
      scheduledAt: input.scheduledAt,
      maxAttempts: input.maxAttempts,
      metadata: input.metadata,
      typeSpecific: { target_tweet_url: input.targetTweetUrl, target_tweet_id: tweetId },
    });
    return { id, idempotencyKey };
  }

  async enqueueRetweet(input: EnqueueEngagementInput): Promise<{ id: string | null; idempotencyKey: string }> {
    const repo = new GenericActionRepository(this.dataSource, ACTION_TABLE_CONFIG.retweet);
    const tweetId = this.parseTweetId(input.targetTweetUrl);
    const idempotencyKey = this.keys.forRetweet(input.accountId, tweetId);
    const id = await repo.insertIfAbsent({
      idempotencyKey,
      accountId: input.accountId,
      scheduledAt: input.scheduledAt,
      maxAttempts: input.maxAttempts,
      metadata: input.metadata,
      typeSpecific: { target_tweet_url: input.targetTweetUrl, target_tweet_id: tweetId },
    });
    return { id, idempotencyKey };
  }

  async enqueueFollow(input: EnqueueFollowInput): Promise<{ id: string | null; idempotencyKey: string }> {
    const repo = new GenericActionRepository(this.dataSource, ACTION_TABLE_CONFIG.follow);
    const idempotencyKey = this.keys.forFollow(input.accountId, input.targetHandle);
    const id = await repo.insertIfAbsent({
      idempotencyKey,
      accountId: input.accountId,
      scheduledAt: input.scheduledAt,
      maxAttempts: input.maxAttempts,
      metadata: input.metadata,
      typeSpecific: { target_handle: input.targetHandle },
    });
    return { id, idempotencyKey };
  }

  async enqueueQuote(input: EnqueueQuoteInput): Promise<{ id: string | null; idempotencyKey: string }> {
    const repo = new GenericActionRepository(this.dataSource, ACTION_TABLE_CONFIG.quote);
    const tweetId = this.parseTweetId(input.targetTweetUrl);
    const idempotencyKey = this.keys.forQuote(input.accountId, tweetId, input.text);
    const id = await repo.insertIfAbsent({
      idempotencyKey,
      accountId: input.accountId,
      scheduledAt: input.scheduledAt,
      maxAttempts: input.maxAttempts,
      metadata: input.metadata,
      typeSpecific: { text: input.text, target_tweet_url: input.targetTweetUrl },
    });
    return { id, idempotencyKey };
  }

  private parseTweetId(url: string): string {
    const m = url.match(/\/status\/(\d+)/);
    if (!m) throw new Error(`Invalid tweet URL: ${url}`);
    return m[1];
  }
}
