import { Injectable } from '@nestjs/common';
import { IdempotencyKeyService } from '@domain/services/idempotency-key';
import { ACTION_TABLE_CONFIG, type ActionTableConfig, type ClaimedReplyRow } from '@persistence/repositories/action-repository';
import type { IActionStrategy } from './action-strategy.port';
import { parseTweetId } from './action-strategy.port';
import type { EnqueueReplyInput } from './enqueue-inputs';

export interface ReplyActionPayload {
  text: string;
  parentTweetUrl: string;
}

@Injectable()
export class ReplyActionStrategy implements IActionStrategy<EnqueueReplyInput, ReplyActionPayload, ClaimedReplyRow> {
  readonly type = 'reply' as const;
  readonly tableConfig: ActionTableConfig = ACTION_TABLE_CONFIG.reply;

  constructor(private readonly keys: IdempotencyKeyService) {}

  idempotencyKey(input: EnqueueReplyInput): string {
    return this.keys.forReply(input.accountId, parseTweetId(input.parentTweetUrl), input.text);
  }

  toColumns(input: EnqueueReplyInput): Record<string, unknown> {
    return {
      text: input.text,
      parent_tweet_url: input.parentTweetUrl,
    };
  }

  toPayload(row: ClaimedReplyRow): ReplyActionPayload {
    return { text: row.text, parentTweetUrl: row.parent_tweet_url };
  }
}
