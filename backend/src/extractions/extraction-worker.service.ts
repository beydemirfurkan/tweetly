import * as fs from 'fs/promises';
import { Injectable } from '@nestjs/common';
import type { PaginatedResult } from '@/x-automation/x-direct';
import {
  ExtractionJobsRepository,
  type ClaimedExtraction,
} from './extraction-jobs.repository';
import { ExtractionService } from './extraction.service';
import { ExtractionStrategyRegistry } from './strategies/extraction-strategy.registry';
import { PollingWorker, WorkerOptionsFactory, type WorkerLoopOptions } from '@/common/workers';

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
export class ExtractionWorker extends PollingWorker {
  private inflight: Promise<unknown> | null = null;
  protected readonly options: WorkerLoopOptions & { batchSize: number };

  constructor(
    private readonly jobs: ExtractionJobsRepository,
    private readonly extractions: ExtractionService,
    private readonly strategies: ExtractionStrategyRegistry,
    private readonly optionsFactory: WorkerOptionsFactory,
  ) {
    super('extract');
    const base = this.optionsFactory.fromEnv('EXTRACTION_WORKER', { pollMs: 5000, lockTtlSec: 300 });
    this.options = {
      ...base,
      batchSize: this.optionsFactory.intFromEnv('EXTRACTION_WORKER_BATCH_SIZE', 50),
    };
  }

  protected async onPreStart(): Promise<void> {
    await this.extractions.ensureStorageDir();
  }

  protected async drainInflight(timeoutMs: number): Promise<void> {
    if (!this.inflight) return;
    this.log.log('Waiting for in-flight extraction page to finish...');
    await Promise.race([
      this.inflight.catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, timeoutMs).unref()),
    ]);
  }

  protected async tick(): Promise<void> {
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

  private fetchPage(
    job: ClaimedExtraction,
    limit: number,
    cursor: string | undefined,
  ): Promise<PaginatedResult<unknown>> {
    return this.strategies.forType(job.type).fetch({
      params: job.params,
      limit,
      accountId: job.accountId ?? undefined,
      cursor,
    });
  }
}
