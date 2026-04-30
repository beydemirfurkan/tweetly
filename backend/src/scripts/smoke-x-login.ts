import 'reflect-metadata';
import * as dotenv from 'dotenv';

import { XLoginService } from '../x-automation/login/x-login.service';

dotenv.config();

async function main(): Promise<void> {
  const username = getRequiredEnv('X_LOGIN_USERNAME');
  const password = getRequiredEnv('X_LOGIN_PASSWORD');
  const email = optionalEnv('X_LOGIN_EMAIL');

  const result = await new XLoginService().run({
    username,
    password,
    email,
  });

  if (!result.ok) {
    console.error(JSON.stringify({
      ok: false,
      reason: result.reason,
      detail: result.detail,
      durationMs: result.durationMs,
    }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    screenName: result.screenName,
    userId: result.userId,
    cookies: {
      hasAuthToken: Boolean(result.cookies.authToken),
      hasCt0: Boolean(result.cookies.ct0),
      hasTwid: Boolean(result.cookies.twid),
    },
    durationMs: result.durationMs,
  }, null, 2));
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
