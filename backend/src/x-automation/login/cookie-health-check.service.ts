import { Injectable, Logger, Optional } from '@nestjs/common';
import { AppConfigService } from '@/config/app-config.service';
import { envBackedConfig, type EnvBackedConfig } from '@/config/process-env-shim';
import { X_PUBLIC_BEARER } from './x-public-bearer';

export interface CookieHealthInput {
  authToken: string;
  ct0: string;
  twid?: string | null;
}

export interface CookieHealthResult {
  ok: boolean;
  /** If ok: the verified screen_name (handle without @). */
  screenName?: string;
  /** If !ok: short reason — surfaces in UI before save. */
  reason?:
    | 'missing_fields'
    | 'rejected_by_x'
    | 'invalid_response'
    | 'network_error';
  detail?: string;
  status?: number;
}

const SETTINGS_URL = 'https://api.x.com/1.1/account/settings.json';

/**
 * Probe X's authenticated settings endpoint with a candidate cookie set to
 * see whether the session is still alive — used by the manual-cookie-paste
 * UI before saving so we don't persist garbage.
 *
 * No Patchright launch: this is a plain HTTPS request with the right
 * Cookie + x-csrf-token + Authorization headers. Quick (<2s typical) and
 * cheap relative to launching Chromium for a sanity check.
 */
@Injectable()
export class CookieHealthCheckService {
  private readonly log = new Logger(CookieHealthCheckService.name);
  private readonly config: EnvBackedConfig;

  // AppConfigService is Optional so the hand-rolled
  // `new CookieHealthCheckService()` in specs keeps working; under DI the
  // global AppConfigModule supplies the real one.
  constructor(@Optional() config?: AppConfigService) {
    this.config = config ?? envBackedConfig();
  }

  // Match the server-side session-check policy: X sometimes returns 401/403
  // for a few seconds after a freshly-set cookie while the session shard
  // syncs. Retry once before the manual-cookie-paste UI surfaces a hard
  // rejection. Read at call time so tests can flip the policy via env.
  private authRetryConfig(): { retries: number; delayMs: number } {
    return {
      retries: this.config.getNumber('COOKIE_HEALTH_AUTH_RETRY', 1),
      delayMs: this.config.getNumber('COOKIE_HEALTH_AUTH_RETRY_DELAY_MS', 2500),
    };
  }

  async check(input: CookieHealthInput): Promise<CookieHealthResult> {
    const authToken = input.authToken?.trim();
    const ct0 = input.ct0?.trim();
    if (!authToken || !ct0) {
      return { ok: false, reason: 'missing_fields', detail: 'authToken and ct0 are required' };
    }

    const cookieParts = [`auth_token=${authToken}`, `ct0=${ct0}`];
    if (input.twid?.trim()) cookieParts.push(`twid=${input.twid.trim()}`);
    const cookieHeader = cookieParts.join('; ');

    const { retries: AUTH_RETRY, delayMs: AUTH_RETRY_DELAY_MS } = this.authRetryConfig();
    let lastAuthRejection: number | null = null;
    for (let attempt = 0; attempt <= AUTH_RETRY; attempt++) {
      let res: Response;
      try {
        res = await fetch(SETTINGS_URL, {
          headers: {
            cookie: cookieHeader,
            'x-csrf-token': ct0,
            authorization: `Bearer ${X_PUBLIC_BEARER}`,
            'user-agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(10_000),
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        this.log.warn(`cookie health-check network error: ${detail}`);
        return { ok: false, reason: 'network_error', detail: truncate(detail, 200) };
      }

      if (res.status === 401 || res.status === 403) {
        lastAuthRejection = res.status;
        if (attempt < AUTH_RETRY) {
          await new Promise((resolve) => setTimeout(resolve, AUTH_RETRY_DELAY_MS));
          continue;
        }
        return {
          ok: false,
          reason: 'rejected_by_x',
          detail: `X rejected the session (HTTP ${res.status} after retries)`,
          status: res.status,
        };
      }

      if (!res.ok) {
        return {
          ok: false,
          reason: 'rejected_by_x',
          detail: `unexpected status from X (HTTP ${res.status})`,
          status: res.status,
        };
      }

      let body: { screen_name?: unknown };
      try {
        body = (await res.json()) as { screen_name?: unknown };
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return { ok: false, reason: 'invalid_response', detail: truncate(detail, 200) };
      }

      if (typeof body.screen_name !== 'string' || !body.screen_name) {
        return {
          ok: false,
          reason: 'invalid_response',
          detail: 'response missing screen_name',
          status: res.status,
        };
      }

      return { ok: true, screenName: body.screen_name, status: res.status };
    }

    // Loop exited only when every attempt got 401/403 — defensive
    // fall-through (the retry branch already returns above).
    return {
      ok: false,
      reason: 'rejected_by_x',
      detail: `X rejected the session (HTTP ${lastAuthRejection} after retries)`,
      status: lastAuthRejection ?? undefined,
    };
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
