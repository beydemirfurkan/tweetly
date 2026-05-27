import { Injectable } from '@nestjs/common';
import { IdempotencyKeyService } from '@domain/services/idempotency-key';
import { ACTION_TABLE_CONFIG, type ActionTableConfig, type ClaimedQuoteRow } from '@persistence/repositories/action-repository';
import type { IActionStrategy } from './action-strategy.port';
import { parseTweetId } from './action-strategy.port';
import type { EnqueueQuoteInput } from './enqueue-inputs';

export interface QuoteActionPayload {
  text: string;
  targetTweetUrl: string;
}

@Injectable()
export class QuoteActionStrategy implements IActionStrategy<EnqueueQuoteInput, QuoteActionPayload, ClaimedQuoteRow> {
  readonly type = 'quote' as const;
  readonly tableConfig: ActionTableConfig = ACTION_TABLE_CONFIG.quote;

  constructor(private readonly keys: IdempotencyKeyService) {}

  idempotencyKey(input: EnqueueQuoteInput): string {
    return this.keys.forQuote(input.accountId, parseTweetId(input.targetTweetUrl), input.text);
  }

  toColumns(input: EnqueueQuoteInput): Record<string, unknown> {
    return { text: input.text, target_tweet_url: input.targetTweetUrl };
  }

  toPayload(row: ClaimedQuoteRow): QuoteActionPayload {
    return { text: row.text, targetTweetUrl: row.target_tweet_url };
  }
}
