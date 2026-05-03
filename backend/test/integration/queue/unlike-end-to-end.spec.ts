import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '@/app.module';
import { ActionEnqueueService } from '@/action-engine/action-enqueue.service';
import { ClaimWorker } from '@/action-engine/claim-worker.service';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { IntegrationDbHarness } from '../harness';

/**
 * End-to-end queue path for unlike_tweet:
 *   enqueue → DB row (pending) → ClaimWorker.tick() → executor → DB row (succeeded)
 *
 * Proves the chain that unit tests can't reach: that extractPayload mapping
 * matches the executor's payload contract, that the wrapper executor is
 * actually registered, and that claim/dispatch/markSucceeded round-trip
 * through the real Postgres tables. The pattern here scales to the other
 * 14 queue-backed tools by swapping the enqueue method and table name.
 */

const TEST_ACCOUNT = 'integration-acc-1';
const TWEET_URL = 'https://x.com/u/status/1';

describe('queue: unlike_tweet end-to-end', () => {
  let harness: IntegrationDbHarness;
  let app: INestApplication;
  let enqueue: ActionEnqueueService;
  let worker: ClaimWorker;
  let registry: ExecutorRegistry;

  beforeAll(async () => {
    harness = new IntegrationDbHarness();
    await harness.start();

    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    enqueue = app.get(ActionEnqueueService);
    worker = app.get(ClaimWorker);
    registry = app.get(ExecutorRegistry);

    // Seed a user + account so FK / lookups don't blow up. accounts is a
    // multi-tenant table — every account belongs to a user via user_id.
    const [{ id: userId }] = await harness.dataSource.query(
      `INSERT INTO users (email, status) VALUES ('integration@test.local', 'active')
       RETURNING id`,
    );
    await harness.dataSource.query(
      `INSERT INTO accounts (id, user_id, display_name, auth_token, status, created_at)
       VALUES ($1, $2, 'Integration', 'fake-token', 'active', now())
       ON CONFLICT (id) DO NOTHING`,
      [TEST_ACCOUNT, userId],
    );
  }, 90_000);

  afterAll(async () => {
    if (app) await app.close();
    if (harness) await harness.stop();
  });

  afterEach(async () => {
    // Truncate every action table between tests so they stay isolated.
    // Keep users + accounts rows across tests (re-seeded in beforeAll).
    await harness.dataSource.query(`
      TRUNCATE TABLE
        unlike_actions, unretweet_actions, unfollow_actions, delete_tweet_actions,
        dm_actions, profile_update_actions, avatar_update_actions, banner_update_actions,
        post_actions, reply_actions, retweet_actions, like_actions, follow_actions,
        quote_actions, bookmark_actions
      RESTART IDENTITY CASCADE
    `);
  });

  it('registers the unlike executor on bootstrap', () => {
    expect(registry.registered()).toContain('unlike');
  });

  it('enqueue inserts a pending row with the matching idempotency key', async () => {
    const { id, idempotencyKey } = await enqueue.enqueueUnlike({
      accountId: TEST_ACCOUNT,
      targetTweetUrl: TWEET_URL,
      scheduledAt: new Date(),
      metadata: { source: 'integration' },
    });

    expect(id).toBeTruthy();
    const [row] = await harness.dataSource.query(
      `SELECT status, idempotency_key, target_tweet_url, target_tweet_id, attempts
         FROM unlike_actions WHERE id=$1`,
      [id],
    );
    expect(row).toEqual(expect.objectContaining({
      status: 'pending',
      idempotency_key: idempotencyKey,
      target_tweet_url: TWEET_URL,
      target_tweet_id: '1',
      attempts: 0,
    }));
  });

  it('idempotency: a second enqueue with the same target collapses, no duplicate row', async () => {
    const first = await enqueue.enqueueUnlike({
      accountId: TEST_ACCOUNT, targetTweetUrl: TWEET_URL, scheduledAt: new Date(),
    });
    const second = await enqueue.enqueueUnlike({
      accountId: TEST_ACCOUNT, targetTweetUrl: TWEET_URL, scheduledAt: new Date(),
    });

    expect(first.id).toBeTruthy();
    expect(second.id).toBeNull();
    expect(second.idempotencyKey).toBe(first.idempotencyKey);

    const [{ count }] = await harness.dataSource.query(
      `SELECT count(*)::int FROM unlike_actions WHERE idempotency_key=$1`,
      [first.idempotencyKey],
    );
    expect(count).toBe(1);
  });

  it('claim worker picks up the pending row and drives it to succeeded', async () => {
    const { id } = await enqueue.enqueueUnlike({
      accountId: TEST_ACCOUNT, targetTweetUrl: TWEET_URL, scheduledAt: new Date(),
    });

    await worker.tick();

    const [row] = await harness.dataSource.query(
      `SELECT status, attempts, last_error, locked_until, locked_by, result_at
         FROM unlike_actions WHERE id=$1`,
      [id],
    );
    expect(row.status).toBe('succeeded');
    // Lock fields cleared after success — otherwise the row would look
    // mid-flight to other workers.
    expect(row.locked_until).toBeNull();
    expect(row.locked_by).toBeNull();
    expect(row.last_error).toBeNull();
    expect(row.result_at).not.toBeNull();
  });

  it('extractPayload contract: claim worker passes target_tweet_url to the executor', async () => {
    // Replace the unlike executor with a probe that captures the payload.
    let capturedPayload: unknown = null;
    const probe = {
      type: 'unlike' as const,
      execute: async (action: { payload: unknown }) => {
        capturedPayload = action.payload;
        return { ok: true as const, result: { kind: 'engagement' as const, at: new Date().toISOString() } };
      },
    };
    registry.register(probe);

    await enqueue.enqueueUnlike({
      accountId: TEST_ACCOUNT, targetTweetUrl: TWEET_URL, scheduledAt: new Date(),
    });
    await worker.tick();

    // claim-worker.service.ts:extractPayload maps the unlike row → executor
    // payload. This contract is invisible to unit tests but breaks loudly in
    // production if anyone touches one side without the other.
    expect(capturedPayload).toEqual({ target_tweet_url: TWEET_URL });
  });
});
