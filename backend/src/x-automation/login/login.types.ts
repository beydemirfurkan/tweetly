import type { LoginJobFailureReason } from '@persistence/entities/account-login-job.entity';

export type { LoginJobFailureReason };

export interface XLoginInput {
  username: string;
  email?: string | null;
  password: string;
  totpSecret?: string | null;
  proxyCountry?: string | null;
  /**
   * For `reauth` jobs the existing accountId is passed through so the login
   * session reuses the same per-account user-data-dir as XBrowserService —
   * keeps fingerprints, cookies and storage in sync and avoids X seeing two
   * different "browsers" for the same account.
   */
  targetAccountId?: string | null;
  /**
   * Optional pre-step cancellation probe. The worker passes a callback that
   * reads `LoginJobsRepository.isCancelled(jobId)` so a user DELETE on the
   * row aborts the in-flight login at the next step boundary with
   * `reason='cancelled'`. Undefined for non-worker callers (smoke scripts).
   */
  isCancelled?: () => Promise<boolean>;
  /**
   * Optional abort signal — driven by the worker's `onModuleDestroy` so a
   * container restart aborts in-flight logins instead of waiting up to 30s
   * for the Patchright session to teardown.
   */
  signal?: AbortSignal;
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
