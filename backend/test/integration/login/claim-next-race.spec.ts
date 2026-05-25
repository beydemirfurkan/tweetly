import { IntegrationDbHarness } from '../harness';
import { LoginJobsRepository } from '@/x-automation/login/login-jobs.repository';

/**
 * Real-postgres test for the `FOR UPDATE SKIP LOCKED` race in
 * `LoginJobsRepository.claimNext`. The unit spec pins the SQL shape; this
 * one pins the runtime guarantee: when N workers tick at the exact same
 * moment, only ONE of them ends up holding the row.
 *
 * Two-worker setup is enough — `SKIP LOCKED` is symmetric, so the third
 * caller doesn't add information.
 */
describe('LoginJobsRepository.claimNext (integration: SKIP LOCKED race)', () => {
  const harness = new IntegrationDbHarness();
  let repo: LoginJobsRepository;
  let userId: string;

  beforeAll(async () => {
    await harness.start();
    repo = new LoginJobsRepository(harness.dataSource);

    // FK target for the job rows.
    const inserted = (await harness.dataSource.query(
      `INSERT INTO users (email) VALUES ('race@example.com') RETURNING id`,
    )) as Array<{ id: string }>;
    userId = inserted[0].id;
  });

  afterAll(async () => {
    await harness.stop();
  });

  beforeEach(async () => {
    await harness.dataSource.query(`DELETE FROM account_login_jobs`);
  });

  async function seedQueuedJob(username: string): Promise<string> {
    const result = await repo.create({
      userId,
      kind: 'connect',
      targetAccountId: null,
      username,
      email: null,
      encryptedPassword: 'enc:pw',
      encryptedTotpSecret: null,
      saveTotpSecret: false,
      proxyCountry: null,
    });
    return result.id;
  }

  it('two concurrent claimNext calls against ONE queued row → exactly one wins', async () => {
    await seedQueuedJob('race-1');

    // Promise.all so both queries open inside the same event-loop tick, then
    // hit the DB roughly together. The SKIP LOCKED clause is what we're
    // actually exercising — if it's missing or the lock scope is wrong,
    // both calls would race to UPDATE the same row.
    const [a, b] = await Promise.all([repo.claimNext(300), repo.claimNext(300)]);

    const winners = [a, b].filter((x) => x !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]!.username).toBe('race-1');

    // And the row is now 'running' under one claimer's lock.
    const rows = (await harness.dataSource.query(
      `SELECT status, locked_until FROM account_login_jobs WHERE username = 'race-1'`,
    )) as Array<{ status: string; locked_until: Date | null }>;
    expect(rows[0].status).toBe('running');
    expect(rows[0].locked_until).not.toBeNull();
  });

  it('three concurrent claimNext calls against TWO queued rows → two distinct winners', async () => {
    await seedQueuedJob('race-a');
    await seedQueuedJob('race-b');

    const results = await Promise.all([
      repo.claimNext(300),
      repo.claimNext(300),
      repo.claimNext(300),
    ]);

    const winners = results.filter((x) => x !== null);
    expect(winners).toHaveLength(2);
    // Each winner got a different row.
    const usernames = winners.map((w) => w!.username).sort();
    expect(usernames).toEqual(['race-a', 'race-b']);
  });

  it('claimNext also reclaims orphaned running rows (locked_until in the past)', async () => {
    const id = await seedQueuedJob('race-orphan');
    // Promote to running with an already-expired lock — simulates a worker
    // that crashed mid-login. The next claimNext should sweep it back.
    await harness.dataSource.query(
      `UPDATE account_login_jobs
          SET status = 'running',
              locked_until = now() - interval '5 minutes'
        WHERE id = $1`,
      [id],
    );

    const claimed = await repo.claimNext(300);
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(id);
    expect(claimed!.username).toBe('race-orphan');
  });

  it('claimNext skips a running row whose lock is still healthy', async () => {
    const id = await seedQueuedJob('race-locked');
    // Healthy in-flight worker: locked_until is in the future.
    await harness.dataSource.query(
      `UPDATE account_login_jobs
          SET status = 'running',
              locked_until = now() + interval '5 minutes'
        WHERE id = $1`,
      [id],
    );

    const claimed = await repo.claimNext(300);
    expect(claimed).toBeNull();
  });
});
