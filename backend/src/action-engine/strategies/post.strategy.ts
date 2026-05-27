import { Injectable } from '@nestjs/common';
import { IdempotencyKeyService } from '@domain/services/idempotency-key';
import { ACTION_TABLE_CONFIG, type ActionTableConfig, type ClaimedPostRow } from '@persistence/repositories/action-repository';
import type { IActionStrategy } from './action-strategy.port';
import type { EnqueuePostInput } from './enqueue-inputs';

export interface PostActionPayload {
  text: string;
  mediaPath: string | null;
  mediaPaths: string[] | null;
  altTexts: string[] | null;
}

@Injectable()
export class PostActionStrategy implements IActionStrategy<EnqueuePostInput, PostActionPayload, ClaimedPostRow> {
  readonly type = 'post' as const;
  readonly tableConfig: ActionTableConfig = ACTION_TABLE_CONFIG.post;

  constructor(private readonly keys: IdempotencyKeyService) {}

  idempotencyKey(input: EnqueuePostInput): string {
    return this.keys.forPost(input.accountId, input.text, input.scheduledAt);
  }

  toColumns(input: EnqueuePostInput): Record<string, unknown> {
    return {
      text: input.text,
      media_path: input.mediaPath ?? (input.mediaPaths?.[0] ?? null),
      media_paths: input.mediaPaths && input.mediaPaths.length > 0 ? input.mediaPaths : null,
      alt_texts: input.altTexts && input.altTexts.length > 0 ? input.altTexts : null,
    };
  }

  toPayload(row: ClaimedPostRow): PostActionPayload {
    return {
      text: row.text,
      mediaPath: row.media_path,
      mediaPaths: row.media_paths,
      altTexts: row.alt_texts,
    };
  }
}
