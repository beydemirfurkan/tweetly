import { config } from '../config';
import { getDb } from './db';

export interface Account {
  id: string;
  displayName: string | null;
  authToken: string;
  authMulti: string | null;
  ct0: string | null;
  twid: string | null;
  status: 'active' | 'paused' | 'banned';
  createdAt: string;
  lastUsedAt: string | null;
}

function rowToAccount(row: Record<string, unknown>): Account {
  return {
    id: row.id as string,
    displayName: (row.display_name as string) ?? null,
    authToken: row.auth_token as string,
    authMulti: (row.auth_multi as string) ?? null,
    ct0: (row.ct0 as string) ?? null,
    twid: (row.twid as string) ?? null,
    status: (row.status as Account['status']) ?? 'active',
    createdAt: row.created_at as string,
    lastUsedAt: (row.last_used_at as string) ?? null,
  };
}

export function list(): Account[] {
  const db = getDb(config.paths.db);
  const rows = db.prepare('SELECT * FROM accounts ORDER BY created_at ASC').all() as Record<string, unknown>[];
  return rows.map(rowToAccount);
}

export function getActive(): Account[] {
  const db = getDb(config.paths.db);
  const rows = db.prepare("SELECT * FROM accounts WHERE status = 'active' ORDER BY created_at ASC").all() as Record<string, unknown>[];
  return rows.map(rowToAccount);
}

export function getById(id: string): Account | null {
  const db = getDb(config.paths.db);
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToAccount(row) : null;
}

export function create(account: Omit<Account, 'createdAt' | 'lastUsedAt'>): Account {
  const db = getDb(config.paths.db);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO accounts (id, display_name, auth_token, auth_multi, ct0, twid, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      auth_token = excluded.auth_token,
      auth_multi = excluded.auth_multi,
      ct0 = excluded.ct0,
      twid = excluded.twid,
      status = excluded.status
  `).run(
    account.id,
    account.displayName ?? null,
    account.authToken,
    account.authMulti ?? null,
    account.ct0 ?? null,
    account.twid ?? null,
    account.status,
    now
  );
  return getById(account.id)!;
}

export function update(id: string, patch: Partial<Pick<Account, 'displayName' | 'status' | 'ct0' | 'twid' | 'authMulti'>>): Account | null {
  const db = getDb(config.paths.db);
  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.displayName !== undefined) { sets.push('display_name = ?'); values.push(patch.displayName); }
  if (patch.status !== undefined) { sets.push('status = ?'); values.push(patch.status); }
  if (patch.ct0 !== undefined) { sets.push('ct0 = ?'); values.push(patch.ct0); }
  if (patch.twid !== undefined) { sets.push('twid = ?'); values.push(patch.twid); }
  if (patch.authMulti !== undefined) { sets.push('auth_multi = ?'); values.push(patch.authMulti); }

  if (sets.length === 0) return getById(id);

  values.push(id);
  db.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getById(id);
}

export function remove(id: string): boolean {
  const db = getDb(config.paths.db);
  const result = db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  return result.changes > 0;
}

export function touchLastUsed(id: string): void {
  const db = getDb(config.paths.db);
  db.prepare('UPDATE accounts SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

export function bootstrapFromEnv(): Account[] {
  const authToken = process.env.X_AUTH_TOKEN?.trim();
  const username = process.env.X_USERNAME?.trim() || `account_${authToken!.slice(-6)}`;
  const authMulti = process.env.X_AUTH_MULTI?.trim();
  const ct0 = process.env.X_CT0?.trim();
  const twid = process.env.X_TWID?.trim();

  if (!authToken) return [];

  const existing = getById(username);
  if (existing) {
    if (!existing.ct0 && ct0) update(username, { ct0 });
    if (!existing.twid && twid) update(username, { twid });
    if (!existing.authMulti && authMulti) update(username, { authMulti });
    return [getById(username)!];
  }

  const account = create({
    id: username,
    displayName: null,
    authToken,
    authMulti: authMulti || null,
    ct0: ct0 || null,
    twid: twid || null,
    status: 'active',
  });

  return [account];
}

export function getDefaultAccountId(): string | null {
  const active = getActive();
  return active.length > 0 ? active[0].id : null;
}

export function count(): number {
  const db = getDb(config.paths.db);
  const row = db.prepare('SELECT COUNT(*) as cnt FROM accounts').get() as { cnt: number };
  return row.cnt;
}
