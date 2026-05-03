import * as fs from 'fs/promises';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { XDirectReadService, type PaginatedResult } from '@/x-automation/x-direct';
import type { ExtractionParams } from '@persistence/entities/extraction-job.entity';
import {
  ExtractionJobsRepository,
  type ClaimedExtraction,
} from './extraction-jobs.repository';
import { ExtractionService } from './extraction.service';

interface WorkerOptions {
  pollIntervalMs: number;
  /** Per-page batch size driven into XDirectReadService.<type>(limit=batchSize). */
  batchSize: number;
  /** Refreshed every progress update so a crashed worker frees the row. */
  lockTtlSec: number;
  enabled: boolean;
}

/**
 * Background worker that drives a queued extraction job through the
 * cursor-paginated read endpoint matching its type. Writes each batch as
 * JSONL lines to disk and updates rows_extracted / last_cursor on every
 * page so callers see progress.
 *
 * One job per tick: each page is a Patchright launch and we don't want
 * a single replica to monopolise the browser pool. Multiple replicas
 * pick in parallel via SKIP LOCKED.
 */
@Injectable()
export class ExtractionWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(ExtractionWorker.name);
  private readonly workerId = `extract-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private inflight: Promise<unknown> | null = null;
  private readonly options: WorkerOptions;

  constructor(
    private readonly jobs: ExtractionJobsRepository,
    private readonly extractions: ExtractionService,
    private readonly reads: XDirectReadService,
  ) {
    this.options = {
      pollIntervalMs: parseInt(process.env.EXTRACTION_WORKER_POLL_MS ?? '5000', 10),
      batchSize: parseInt(process.env.EXTRACTION_WORKER_BATCH_SIZE ?? '50', 10),
      lockTtlSec: parseInt(process.env.EXTRACTION_WORKER_LOCK_TTL_SEC ?? '300', 10),
      enabled: process.env.EXTRACTION_WORKER_DISABLED !== 'true',
    };
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.options.enabled) {
      this.log.log('ExtractionWorker disabled (EXTRACTION_WORKER_DISABLED=true).');
      return;
    }
    await this.extractions.ensureStorageDir();
    this.log.log(
      `ExtractionWorker started: id=${this.workerId} poll=${this.options.pollIntervalMs}ms ` +
        `batch=${this.options.batchSize} lock=${this.options.lockTtlSec}s`,
    );
    this.scheduleNext();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inflight) {
      this.log.log('Waiting for in-flight extraction page to finish...');
      await Promise.race([
        this.inflight.catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 30_000).unref()),
      ]);
    }
    this.log.log('ExtractionWorker stopped.');
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.tick()
        .catch((err) =>
          this.log.error(`tick error: ${err instanceof Error ? err.message : String(err)}`),
        )
        .finally(() => this.scheduleNext());
    }, this.options.pollIntervalMs);
  }

  private async tick(): Promise<void> {
    if (this.inflight) return;
    const job = await this.jobs.claimNext(this.options.lockTtlSec);
    if (!job) return;

    const p = this.process(job)
      .catch(async (err) => {
        const detail = err instanceof Error ? err.message : String(err);
        this.log.error(`process error job=${job.id}: ${detail}`);
        await this.jobs.markFailure(job.id, `worker crashed: ${detail}`, 0).catch(() => undefined);
      })
      .finally(() => {
        this.inflight = null;
      });
    this.inflight = p;
    await p;
  }

  /** Visible for unit tests. */
  async process(job: ClaimedExtraction): Promise<void> {
    const filePath = this.extractions.filePathFor(job.id);
    this.log.log(`process job=${job.id} type=${job.type} maxRows=${job.maxRows}`);

    let cursor: string | undefined = job.lastCursor ?? undefined;
    let totalRows = job.rowsExtracted;
    const handle = await fs.open(filePath, totalRows === 0 ? 'w' : 'a');

    try {
      while (totalRows < job.maxRows) {
        const remaining = job.maxRows - totalRows;
        const limit = Math.min(this.options.batchSize, remaining);
        const page = await this.fetchPage(job, limit, cursor);

        for (const item of page.items) {
          await handle.write(JSON.stringify(item) + '\n');
        }
        totalRows += page.items.length;

        if (!page.nextCursor || page.items.length === 0) {
          // Source exhausted or stalled — return what we have.
          await this.jobs.markSuccess(job.id, filePath, totalRows);
          this.log.log(`succeeded job=${job.id} rows=${totalRows} (source exhausted)`);
          return;
        }

        cursor = page.nextCursor;
        await this.jobs.updateProgress(job.id, totalRows, cursor, this.options.lockTtlSec);
      }

      await this.jobs.markSuccess(job.id, filePath, totalRows);
      this.log.log(`succeeded job=${job.id} rows=${totalRows} (max_rows reached)`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      await this.jobs.markFailure(job.id, detail, totalRows);
      this.log.warn(`failed job=${job.id} rows=${totalRows}: ${detail}`);
    } finally {
      await handle.close();
    }
  }

  private async fetchPage(
    job: ClaimedExtraction,
    limit: number,
    cursor: string | undefined,
  ): Promise<PaginatedResult<unknown>> {
    const accountId = job.accountId ?? undefined;
    const params = job.params;
    switch (job.type) {
      case 'user_followers':
        return this.reads.getUserFollowers(this.requireHandle(params), limit, accountId, cursor, {
          verifiedOnly: params.verifiedOnly,
        });
      case 'user_following':
        return this.reads.getUserFollowing(this.requireHandle(params), limit, accountId, cursor, {
          verifiedOnly: params.verifiedOnly,
        });
      case 'user_tweets':
        return this.reads.getUserTweets(this.requireHandle(params), limit, accountId, cursor);
      case 'user_likes':
        return this.reads.getUserLikes(this.requireHandle(params), limit, accountId, cursor);
      case 'user_mentions':
        return this.reads.getUserMentions(this.requireHandle(params), limit, accountId, cursor);
      case 'tweet_retweeters':
        return this.reads.getTweetRetweeters(
          this.requireTweetUrl(params),
          limit,
          accountId,
          cursor,
          { verifiedOnly: params.verifiedOnly },
        );
      case 'search_tweets':
        return this.reads.searchTweets(this.requireQuery(params), limit, accountId, cursor);
      case 'list_members':
        return this.reads.getListMembers(this.requireListId(params), limit, accountId, cursor, {
          verifiedOnly: params.verifiedOnly,
        });
    }
  }

  private requireHandle(p: ExtractionParams): string {
    if (!p.handle) throw new Error('params.handle is required');
    return p.handle;
  }

  private requireTweetUrl(p: ExtractionParams): string {
    if (!p.tweetUrl) throw new Error('params.tweetUrl is required');
    return p.tweetUrl;
  }

  private requireQuery(p: ExtractionParams): string {
    if (!p.query) throw new Error('params.query is required');
    return p.query;
  }

  private requireListId(p: ExtractionParams): string {
    if (!p.listId) throw new Error('params.listId is required');
    return p.listId;
  }
}
