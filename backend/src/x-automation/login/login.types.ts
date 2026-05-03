import type { LoginJobFailureReason } from '@persistence/entities/account-login-job.entity';

export type { LoginJobFailureReason };

export interface XLoginInput {
  username: string;
  email?: string | null;
  password: string;
  totpSecret?: string | null;
  proxyCountry?: string | null;
}

export interface XLoginCookies {
  authToken: string;
  ct0: string;
  twid: string | null;
}

export interface XLoginSuccess {
  ok: true;
  /** Verified screen_name as returned by X (handle without @). May differ from input. */
  screenName: string;
  /** Numeric user id parsed from twid cookie or settings.json. */
  userId: string | null;
  cookies: XLoginCookies;
  /** Total wall-clock time in ms. */
  durationMs: number;
}

export interface XLoginFailure {
  ok: false;
  reason: LoginJobFailureReason;
  /** Operator-facing detail (no PII). */
  detail: string;
  durationMs: number;
}

export type XLoginResult = XLoginSuccess | XLoginFailure;
