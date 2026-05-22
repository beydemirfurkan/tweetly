import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { AppDataSource } from '@persistence/data-source';
import { encryptCookieValue } from '@common/crypto/cookie-cipher.transformer';

dotenv.config();

const COOKIE_COLS = ['auth_token', 'auth_multi', 'ct0', 'twid'] as const;

async function main(): Promise<void> {
  if (process.env.COOKIE_ENCRYPT_MIGRATE !== 'true') {
    console.error(
      'Refusing to run: set COOKIE_ENCRYPT_MIGRATE=true to enable this one-shot re-encryption.',
    );
    process.exit(2);
  }

  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();

  const rows = (await qr.query(
    `SELECT id, ${COOKIE_COLS.join(', ')} FROM accounts`,
  )) as Array<Record<(typeof COOKIE_COLS)[number] | 'id', string | null>>;

  let scanned = 0;
  let encrypted = 0;
  let alreadyOk = 0;
  let nulls = 0;

  for (const row of rows) {
    scanned++;
    const updates: Record<string, string | null> = {};
    let touched = false;

    for (const col of COOKIE_COLS) {
      const v = row[col];
      if (v === null || v === undefined || v === '') {
        nulls++;
        continue;
      }
      if (v.startsWith('v1:')) {
        alreadyOk++;
        continue;
      }
      updates[col] = encryptCookieValue(v);
      touched = true;
    }

    if (!touched) continue;

    const setFragments = Object.keys(updates).map((c, i) => `${c} = $${i + 2}`).join(', ');
    const values = [row.id, ...Object.values(updates)];
    await qr.query(`UPDATE accounts SET ${setFragments} WHERE id = $1`, values);
    encrypted += Object.keys(updates).length;
  }

  await qr.release();
  await AppDataSource.destroy();

  console.log(
    `Done. accounts_scanned=${scanned} cookie_fields_encrypted=${encrypted} ` +
      `already_ciphertext_fields=${alreadyOk} null_or_empty_fields=${nulls}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
