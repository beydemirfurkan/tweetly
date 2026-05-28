import type { PaginatedResult } from '@/x-automation/x-direct';
import type {
  ExtractionParams,
  ExtractionType,
} from '@persistence/entities/extraction-job.entity';
import type { ExtractionFetchArgs, IExtractionStrategy } from './extraction-strategy.port';

export abstract class ExtractionStrategyBase implements IExtractionStrategy {
  abstract readonly type: ExtractionType;
  abstract fetch(args: ExtractionFetchArgs): Promise<PaginatedResult<unknown>>;

  protected requireHandle(p: ExtractionParams): string {
    if (!p.handle) throw new Error('params.handle is required');
    return p.handle;
  }

  protected requireTweetUrl(p: ExtractionParams): string {
    if (!p.tweetUrl) throw new Error('params.tweetUrl is required');
    return p.tweetUrl;
  }

  protected requireQuery(p: ExtractionParams): string {
    if (!p.query) throw new Error('params.query is required');
    return p.query;
  }

  protected requireListId(p: ExtractionParams): string {
    if (!p.listId) throw new Error('params.listId is required');
    return p.listId;
  }
}
