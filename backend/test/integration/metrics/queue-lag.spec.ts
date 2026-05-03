import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '@/app.module';
import { AdminApiService } from '@/admin-api/admin-api.service';
import { ActionEnqueueService } from '@/action-engine/action-enqueue.service';
import { IntegrationDbHarness } from '../harness';

/**
 * Queue lag (oldest pending age per type) is the canary for "workers
 * stuck or stalled". Validate against real Postgres so the EXTRACT(EPOCH)
 * arithmetic is exercised end-to-end — pure unit mocks would miss
 * timezone or null-MIN edge cases.
 */
describe('AdminApiService.getQueueLag', () => {
  let harness: IntegrationDbHarness;
  let app: INestApplication;
  let admin: AdminApiService;
  let enqueue: ActionEnqueueService;
  const TEST_ACCOUNT = 'lag-test-acc';

  beforeAll(async () => {
    harness = new IntegrationDbHarness();
    await harness.start();
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    admin = app.get(AdminApiService);
    enqueue = app.get(ActionEnqueueService);

    const [{ id: userId }] = await harness.dataSource.query(
      `INSERT INTO users (email, status) VALUES ('lag@test.local', 'active') RETURNING id`,
    );
    await harness.dataSource.query(
      `INSERT INTO accounts (id, user_id, display_name, auth_token, status, created_at)
       VALUES ($1, $2, 'Lag', 'tok', 'active', now())`,
      [TEST_ACCOUNT, userId],
    );
  }, 90_000);

  afterAll(async () => {
    if (app) await app.close();
    if (harness) await harness.stop();
  });

  beforeEach(async () => {
    await harness.dataSource.query(`
      TRUNCATE TABLE
        unlike_actions, unretweet_actions, unfollow_actions, delete_tweet_actions,
        dm_actions, profile_update_actions, avatar_update_actions, banner_update_actions,
        post_actions, reply_actions, retweet_actions, like_actions, follow_actions,
        quote_actions, bookmark_actions
      RESTART IDENTITY CASCADE
    `);
  });

  it('returns 0 lag for every type when there are no pending actions', async () => {
    const lag = await admin.getQueueLag();
    // 15 action types in the system as of this sprint.
    expect(lag).toHaveLength(15);
    for (const entry of lag) {
      expect(entry.oldestPendingSeconds).toBe(0);
    }
  });

  it('reports the age of the oldest pending action per type', async () => {
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    await enqueue.enqueueLike({
      accountId: TEST_ACCOUNT,
      targetTweetUrl: 'https://x.com/u/status/1',
      scheduledAt: oneMinuteAgo,
    });

    const lag = await admin.getQueueLag();
    const likeLag = lag.find((l) => l.type === 'like');
    expect(likeLag).toBeDefined();
    // Should be roughly 60s (allow a wide 50-90s window for test clock jitter).
    expect(likeLag!.oldestPendingSeconds).toBeGreaterThanOrEqual(50);
    expect(likeLag!.oldestPendingSeconds).toBeLessThanOrEqual(120);

    // Other types stay at 0.
    const unlikeLag = lag.find((l) => l.type === 'unlike');
    expect(unlikeLag!.oldestPendingSeconds).toBe(0);
  });

  it('uses the OLDEST pending row when multiple are queued', async () => {
    const tenMinAgo = new Date(Date.now() - 600_000);
    const oneMinAgo = new Date(Date.now() - 60_000);
    // Insert oldest first; idempotency keys must differ so both stick.
    await enqueue.enqueueLike({
      accountId: TEST_ACCOUNT,
      targetTweetUrl: 'https://x.com/u/status/100',
      scheduledAt: tenMinAgo,
    });
    await enqueue.enqueueLike({
      accountId: TEST_ACCOUNT,
      targetTweetUrl: 'https://x.com/u/status/200',
      scheduledAt: oneMinAgo,
    });

    const lag = await admin.getQueueLag();
    const likeLag = lag.find((l) => l.type === 'like');
    expect(likeLag!.oldestPendingSeconds).toBeGreaterThanOrEqual(550);
    expect(likeLag!.oldestPendingSeconds).toBeLessThanOrEqual(700);
  });
});
