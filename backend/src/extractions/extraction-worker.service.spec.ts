import * as os from 'os';
import * as path from 'path';
import { ExtractionWorker } from './extraction-worker.service';
import type {
  ClaimedExtraction,
  ExtractionJobsRepository,
} from './extraction-jobs.repository';
import type { ExtractionService } from './extraction.service';
import type { PaginatedResult, XDirectReadService } from '@/x-automation/x-direct';

// fs/promises.open is the only filesystem touch the worker makes; mock the
// returned handle so process() doesn't actually write to disk during tests.
jest.mock('fs/promises', () => {
  const open = jest.fn(async () => ({
    write: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  }));
  return { open };
});

function makeClaimed(overrides: Partial<ClaimedExtraction> = {}): ClaimedExtraction {
  return {
    id: 'job-1',
    userId: 'user-1',
    accountId: 'acc-1',
    type: 'user_followers',
    params: { handle: 'alice' },
    maxRows: 100,
    rowsExtracted: 0,
    lastCursor: null,
    ...overrides,
  };
}

function makePage(items: unknown[], nextCursor: string | null): PaginatedResult<unknown> {
  return { items, nextCursor };
}

function makeWorker(opts: {
  pages?: PaginatedResult<unknown>[];
  fetchThrows?: Error;
  batchSize?: number;
}): {
  worker: ExtractionWorker;
  jobs: jest.Mocked<ExtractionJobsRepository>;
  reads: jest.Mocked<XDirectReadService>;
  extractions: jest.Mocked<ExtractionService>;
} {
  // Each call to a read endpoint pops one page from the queue. Tests
  // pre-seed the queue with whatever progression they want to assert.
  const pages = [...(opts.pages ?? [])];
  const fetchImpl = jest.fn(async (): Promise<PaginatedResult<unknown>> => {
    if (opts.fetchThrows) throw opts.fetchThrows;
    const page = pages.shift();
    if (!page) throw new Error('no more mocked pages');
    return page;
  });

  const jobs = {
    claimNext: jest.fn().mockResolvedValue(null),
    markSuccess: jest.fn().mockResolvedValue(undefined),
    markFailure: jest.fn().mockResolvedValue(undefined),
    updateProgress: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ExtractionJobsRepository>;

  const reads = {
    getUserFollowers: fetchImpl,
    getUserFollowing: fetchImpl,
    getUserTweets: fetchImpl,
    getUserLikes: fetchImpl,
    getUserMentions: fetchImpl,
    getTweetRetweeters: fetchImpl,
    searchTweets: fetchImpl,
    getListMembers: fetchImpl,
  } as unknown as jest.Mocked<XDirectReadService>;

  const extractions = {
    filePathFor: jest.fn((id: string) => path.join(os.tmpdir(), `${id}.jsonl`)),
    ensureStorageDir: jest.fn().mockResolvedValue(os.tmpdir()),
  } as unknown as jest.Mocked<ExtractionService>;

  if (opts.batchSize) process.env.EXTRACTION_WORKER_BATCH_SIZE = String(opts.batchSize);

  const worker = new ExtractionWorker(jobs, extractions, reads);
  return { worker, jobs, reads, extractions };
}

afterEach(() => {
  delete process.env.EXTRACTION_WORKER_BATCH_SIZE;
});

describe('ExtractionWorker.process: source-exhausted path', () => {
  it('writes one page and calls markSuccess when nextCursor is null', async () => {
    const { worker, jobs } = makeWorker({
      pages: [makePage([{ handle: 'a' }, { handle: 'b' }], null)],
      batchSize: 50,
    });

    await worker.process(makeClaimed({ maxRows: 100 }));

    expect(jobs.markSuccess).toHaveBeenCalledWith('job-1', expect.stringContaining('job-1.jsonl'), 2);
    expect(jobs.updateProgress).not.toHaveBeenCalled();
    expect(jobs.markFailure).not.toHaveBeenCalled();
  });

  it('treats an empty page as exhausted and stops without progressing the cursor', async () => {
    const { worker, jobs } = makeWorker({
      pages: [makePage([], 'cursor-x')],
      batchSize: 50,
    });

    await worker.process(makeClaimed({ maxRows: 100 }));

    expect(jobs.markSuccess).toHaveBeenCalledWith('job-1', expect.any(String), 0);
    expect(jobs.updateProgress).not.toHaveBeenCalled();
  });
});

describe('ExtractionWorker.process: multi-page progression', () => {
  it('advances through pages, calls updateProgress after each, and stops at maxRows', async () => {
    // batchSize=2, maxRows=4 → two full pages, two updateProgress calls,
    // then markSuccess when the while-condition flips false at the top of
    // the next iteration. updateProgress fires *before* the loop guard so
    // the row's progress reflects the latest total even if the worker
    // crashes between the write and the next claim.
    const { worker, jobs } = makeWorker({
      pages: [
        makePage([{ a: 1 }, { a: 2 }], 'c1'),
        makePage([{ a: 3 }, { a: 4 }], 'c2'),
      ],
      batchSize: 2,
    });

    await worker.process(makeClaimed({ maxRows: 4 }));

    expect(jobs.updateProgress).toHaveBeenNthCalledWith(1, 'job-1', 2, 'c1', expect.any(Number));
    expect(jobs.updateProgress).toHaveBeenNthCalledWith(2, 'job-1', 4, 'c2', expect.any(Number));
    expect(jobs.markSuccess).toHaveBeenCalledWith('job-1', expect.any(String), 4);
  });

  it('resumes from job.lastCursor and rowsExtracted when restarting a partial extraction', async () => {
    // The worker was claimed against an already-mid-flight row (e.g. lock
    // expired). Should pass lastCursor into the first fetch and treat
    // rowsExtracted as the running total.
    const { worker, reads, jobs } = makeWorker({
      pages: [makePage([{ handle: 'c' }], null)],
      batchSize: 10,
    });

    await worker.process(
      makeClaimed({ rowsExtracted: 5, lastCursor: 'resume-here', maxRows: 100 }),
    );

    // First (and only) read call gets the resume cursor.
    expect(reads.getUserFollowers).toHaveBeenCalledWith(
      'alice',
      10,
      'acc-1',
      'resume-here',
      { verifiedOnly: undefined },
    );
    // Total rows = pre-existing 5 + 1 from this page = 6.
    expect(jobs.markSuccess).toHaveBeenCalledWith('job-1', expect.any(String), 6);
  });
});

describe('ExtractionWorker.process: max-rows truncation', () => {
  it('clamps the per-page limit to (maxRows - totalRows) so we never overfetch', async () => {
    // batchSize=50, maxRows=3 → first fetch should use limit=3.
    const { worker, reads } = makeWorker({
      pages: [makePage([{ a: 1 }, { a: 2 }, { a: 3 }], null)],
      batchSize: 50,
    });

    await worker.process(makeClaimed({ maxRows: 3 }));

    // The 50-batch worker should have requested only 3 rows.
    expect(reads.getUserFollowers).toHaveBeenCalledWith(
      'alice',
      3,
      'acc-1',
      undefined,
      { verifiedOnly: undefined },
    );
  });
});

describe('ExtractionWorker.process: failure path', () => {
  it('catches a thrown fetch and calls markFailure with the running row count', async () => {
    const { worker, jobs } = makeWorker({
      fetchThrows: new Error('patchright timeout'),
      batchSize: 50,
    });

    await worker.process(makeClaimed({ maxRows: 100 }));

    expect(jobs.markFailure).toHaveBeenCalledWith('job-1', 'patchright timeout', 0);
    expect(jobs.markSuccess).not.toHaveBeenCalled();
  });

  it('rejects an unknown type by way of the missing-param helpers', async () => {
    const { worker, jobs } = makeWorker({
      pages: [],
      batchSize: 50,
    });

    // search_tweets requires params.query — without it, fetchPage throws,
    // which the surrounding try/catch routes to markFailure.
    await worker.process(makeClaimed({ type: 'search_tweets', params: {}, maxRows: 100 }));

    expect(jobs.markFailure).toHaveBeenCalledWith(
      'job-1',
      expect.stringMatching(/params\.query is required/),
      0,
    );
  });
});

describe('ExtractionWorker.process: type routing', () => {
  it.each([
    ['user_following', { handle: 'alice' }, 'getUserFollowing'] as const,
    ['user_tweets', { handle: 'alice' }, 'getUserTweets'] as const,
    ['user_likes', { handle: 'alice' }, 'getUserLikes'] as const,
    ['user_mentions', { handle: 'alice' }, 'getUserMentions'] as const,
    ['tweet_retweeters', { tweetUrl: 'https://x.com/u/status/1' }, 'getTweetRetweeters'] as const,
    ['search_tweets', { query: 'q' }, 'searchTweets'] as const,
    ['list_members', { listId: '1' }, 'getListMembers'] as const,
  ])('dispatches type=%s to the matching XDirectReadService method', async (type, params, method) => {
    const { worker, reads } = makeWorker({
      pages: [makePage([{ x: 1 }], null)],
      batchSize: 10,
    });
    await worker.process(makeClaimed({ type, params, maxRows: 100 }));
    expect((reads as any)[method]).toHaveBeenCalled();
  });
});
