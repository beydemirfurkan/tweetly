import { IntegrationDbHarness } from './harness';

/**
 * Sanity test for the harness itself: bring up an empty DB, run migrations,
 * truncate, drop. If this passes, every other integration spec can rely on
 * the harness contract.
 */
describe('IntegrationDbHarness', () => {
  it('creates a fresh database, applies migrations, allows truncate, drops on stop', async () => {
    const harness = new IntegrationDbHarness();
    await harness.start();

    // Migrations should have created our 15 action tables.
    const rows = (await harness.dataSource.query(
      `SELECT tablename FROM pg_tables
        WHERE schemaname='public' AND tablename LIKE '%_actions'
        ORDER BY tablename`,
    )) as Array<{ tablename: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(15);
    expect(rows.map((r) => r.tablename)).toEqual(
      expect.arrayContaining([
        'post_actions',
        'unlike_actions',
        'profile_update_actions',
        'banner_update_actions',
      ]),
    );

    // Insert + truncate roundtrip.
    await harness.dataSource.query(
      `INSERT INTO unlike_actions (account_id, idempotency_key, scheduled_at, target_tweet_url)
       VALUES ('acc-1', 'k-1', now(), 'https://x.com/u/status/1')`,
    );
    let count = await harness.dataSource.query(`SELECT count(*)::int FROM unlike_actions`);
    expect(count[0].count).toBe(1);

    await harness.truncateAll();
    count = await harness.dataSource.query(`SELECT count(*)::int FROM unlike_actions`);
    expect(count[0].count).toBe(0);

    await harness.stop();
  });
});
