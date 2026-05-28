import type { PaginatedResult } from '@/x-automation/x-direct';
import type {
  ExtractionParams,
  ExtractionType,
} from '@persistence/entities/extraction-job.entity';

export interface ExtractionFetchArgs {
  params: ExtractionParams;
  limit: number;
  accountId?: string;
  cursor?: string;
}

export interface IExtractionStrategy {
  readonly type: ExtractionType;
  fetch(args: ExtractionFetchArgs): Promise<PaginatedResult<unknown>>;
}

export const EXTRACTION_STRATEGY = Symbol('IExtractionStrategy');
