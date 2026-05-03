import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

import { AccountsService } from '@/accounts/accounts.service';
import { ControlStateRepository } from '@persistence/repositories/control-state.repository';
import { CredentialCipherService } from '@common/crypto/credential-cipher.service';
import { AccountEntity } from '@persistence/entities/account.entity';
import { AppDataSource } from '@persistence/data-source';
import { LoginJobsRepository, type ClaimedJob } from '@/x-automation/login/login-jobs.repository';
import { LoginWorker } from '@/x-automation/login/login-worker.service';
import { XLoginService } from '@/x-automation/login/x-login.service';

dotenv.config();

async function main(): Promise<void> {
  process.env.WORKER_DISABLED = 'true';
  process.env.LOGIN_WORKER_DISABLED = 'true';
  process.env.MONITOR_POLLING_ENABLED = 'false';
  process.env.X_EXECUTOR_MODE = process.env.X_EXECUTOR_MODE || 'noop';

  const username = getRequiredEnv('X_LOGIN_USERNAME').replace(/^@+/, '');
  const password = getRequiredEnv('X_LOGIN_PASSWORD');
  const email = optionalEnv('X_LOGIN_EMAIL');
  const tweetlyUserEmail = process.env.TWEETLY_USER_EMAIL?.trim() || 'smoke@tweetly.local';

  await AppDataSource.initialize();
  try {
    const dataSource = AppDataSource;
    const cipher = new CredentialCipherService();
    const jobs = new LoginJobsRepository(dataSource);
    const accounts = new AccountsService(
      dataSource.getRepository(AccountEntity),
      dataSource,
      new ControlStateRepository(dataSource),
    );
    const worker = new LoginWorker(dataSource, jobs, new XLoginService(), cipher, accounts, { refreshInBackground: async () => {} } as any);
    const user = await findOrCreateUser(dataSource, tweetlyUserEmail);

    const { id } = await jobs.create({
      userId: user.id,
      kind: 'connect',
      targetAccountId: null,
      username,
      email,
      encryptedPassword: cipher.encrypt(password),
      encryptedTotpSecret: null,
      saveTotpSecret: false,
      proxyCountry: null,
    });
    const claimedJob = await claimExactJob(dataSource, id);
    await worker.process(claimedJob);

    const status = await getJobStatus(dataSource, id);
    console.log(JSON.stringify({
      ok: status.status === 'success',
      jobId: id,
      status: status.status,
      targetAccountId: status.target_account_id,
      failureReason: status.failure_reason,
      failureDetail: status.failure_detail,
    }, null, 2));

    if (status.status !== 'success') process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

async function findOrCreateUser(dataSource: DataSource, email: string): Promise<{ id: string }> {
  const normalized = email.trim().toLowerCase();
  const existing = (await dataSource.query(
    `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
    [normalized],
  )) as Array<{ id: string }>;
  if (existing[0]) return existing[0];

  const inserted = (await dataSource.query(
    `INSERT INTO users (email, email_verified_at) VALUES ($1, now()) RETURNING id`,
    [normalized],
  )) as Array<{ id: string }>;
  return inserted[0];
}

async function claimExactJob(dataSource: DataSource, id: string): Promise<ClaimedJob> {
  const raw = await dataSource.query(
    `UPDATE account_login_jobs
        SET status = 'running', started_at = COALESCE(started_at, now()), locked_until = now() + interval '5 minutes'
      WHERE id = $1
      RETURNING id, user_id, kind, target_account_id, username, email,
                encrypted_password, encrypted_totp_secret, save_totp_secret, proxy_country`,
    [id],
  );
  const rows = (Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw) as Array<{
    id: string;
    user_id: string;
    kind: 'connect' | 'reauth';
    target_account_id: string | null;
    username: string;
    email: string | null;
    encrypted_password: string;
    encrypted_totp_secret: string | null;
    save_totp_secret: boolean;
    proxy_country: string | null;
  }>;
  const row = rows[0];
  if (!row) throw new Error(`login job ${id} not found`);
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    targetAccountId: row.target_account_id,
    username: row.username,
    email: row.email,
    encryptedPassword: row.encrypted_password,
    encryptedTotpSecret: row.encrypted_totp_secret,
    saveTotpSecret: row.save_totp_secret,
    proxyCountry: row.proxy_country,
  };
}

async function getJobStatus(dataSource: DataSource, id: string): Promise<{
  status: string;
  target_account_id: string | null;
  failure_reason: string | null;
  failure_detail: string | null;
}> {
  const rows = (await dataSource.query(
    `SELECT status, target_account_id, failure_reason, failure_detail
       FROM account_login_jobs
      WHERE id = $1`,
    [id],
  )) as Array<{
    status: string;
    target_account_id: string | null;
    failure_reason: string | null;
    failure_detail: string | null;
  }>;
  const row = rows[0];
  if (!row) throw new Error(`login job ${id} not found after processing`);
  return row;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
