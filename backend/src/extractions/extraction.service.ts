import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EXTRACTION_TYPES,
  type ExtractionParams,
  type ExtractionType,
} from '@persistence/entities/extraction-job.entity';
import { AppConfigService } from '@/config/app-config.service';
import { ExtractionJobsRepository, type ExtractionView } from './extraction-jobs.repository';

const MAX_ROWS_HARD_CAP = 100_000;

export interface EnqueueExtractionInput {
  userId: string;
  accountId: string | null;
  type: ExtractionType;
  params: ExtractionParams;
  maxRows: number;
}
@Injectable()
export class ExtractionService {
  private readonly storageDir: string;

  constructor(
    private readonly jobs: ExtractionJobsRepository,
    config: AppConfigService,
  ) {
    this.storageDir = config.getString('EXTRACTIONS_DIR', path.join(os.tmpdir(), 'tweetly-extractions'));
  }

  /** Resolved on first use so the worker can use the same dir. */
  async ensureStorageDir(): Promise<string> {
    await fs.mkdir(this.storageDir, { recursive: true });
    return this.storageDir;
  }

  filePathFor(jobId: string): string {
    return path.join(this.storageDir, `${jobId}.jsonl`);
  }

  validateAndEnqueue(input: EnqueueExtractionInput): Promise<{ id: string }> {
    if (!EXTRACTION_TYPES.includes(input.type)) {
      throw new BadRequestException(
        `unsupported type '${input.type}'. Supported: ${EXTRACTION_TYPES.join(', ')}`,
      );
    }
    if (!Number.isInteger(input.maxRows) || input.maxRows < 1 || input.maxRows > MAX_ROWS_HARD_CAP) {
      throw new BadRequestException(`max_rows must be an integer in [1, ${MAX_ROWS_HARD_CAP}]`);
    }
    this.assertParamsForType(input.type, input.params);
    return this.jobs.create({
      userId: input.userId,
      accountId: input.accountId,
      type: input.type,
      params: input.params,
      maxRows: input.maxRows,
    });
  }

  async findForUser(jobId: string, userId: string): Promise<ExtractionView> {
    const job = await this.jobs.findByIdForUser(jobId, userId);
    if (!job) throw new NotFoundException(`extraction ${jobId} not found`);
    return job;
  }

  listForUser(userId: string, limit: number): Promise<ExtractionView[]> {
    return this.jobs.listForUser(userId, Math.min(Math.max(limit, 1), 100));
  }

  cancel(jobId: string, userId: string): Promise<boolean> {
    return this.jobs.cancelById(jobId, userId);
  }

  /**
   * Open the JSONL file for streaming back to the caller. Throws when the
   * job isn't done OR the file is missing — both are bugs at this point.
   */
  async readableFile(job: ExtractionView): Promise<string> {
    if (job.status !== 'succeeded' || !job.filePath) {
      throw new BadRequestException(`extraction ${job.id} is ${job.status}, no file to download`);
    }
    try {
      await fs.access(job.filePath);
    } catch {
      throw new NotFoundException(`extraction ${job.id} file is missing on disk`);
    }
    return job.filePath;
  }

  private assertParamsForType(type: ExtractionType, params: ExtractionParams): void {
    switch (type) {
      case 'user_followers':
      case 'user_following':
      case 'user_tweets':
      case 'user_likes':
      case 'user_mentions':
        if (!params.handle) throw new BadRequestException(`type '${type}' requires params.handle`);
        return;
      case 'tweet_retweeters':
        if (!params.tweetUrl?.includes('/status/')) {
          throw new BadRequestException(`type 'tweet_retweeters' requires params.tweetUrl`);
        }
        return;
      case 'search_tweets':
        if (!params.query) throw new BadRequestException(`type 'search_tweets' requires params.query`);
        return;
      case 'list_members':
        if (!params.listId || !/^\d+$/.test(params.listId)) {
          throw new BadRequestException(`type 'list_members' requires numeric params.listId`);
        }
        return;
    }
  }
}
