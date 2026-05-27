import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { type BrowserContext, type Page } from 'patchright';
import { LoginFlowError } from './login-error';
import { redactLoginDebugText, writeLoginDebugArtifact } from './login-debug-artifact';
import type { XLoginInput, XLoginResult } from './login.types';
import {
  classifyOnboardingError,
  collectOnboardingErrors,
  parseUserIdFromTwid,
  resolveLoginProfileDir,
  stripAt,
  truncate,
} from './login-classifiers';
import { extractCookies } from './login-page.utils';
import { tryPreLoginSession, verifyAuthenticatedSession } from './login-session-check';
import { buildCancelCheck } from './x-login-step';
import { buildLoginContext, LOGIN_FLAGS } from './x-login-context.factory';
import { runLoginFlow } from './x-login-flow.runner';

// Re-exports preserved for backward compatibility with consumers (specs and
// scripts import these from x-login.service directly).
export { classifyOnboardingError, resolveLoginProfileDir };

// Exported for unit tests — pins the cancellation contract that the runStep
// loop relies on. Not part of the public service surface.
export { buildCancelCheck };

@Injectable()
export class XLoginService {
  private readonly log = new Logger(XLoginService.name);

  /**
   * Perform an end-to-end X login in a per-account persistent context.
   *
   * Reauth jobs reuse the existing account's user-data-dir so the login
   * session shares fingerprint, storage and IndexedDB with later tool calls
   * driven by XBrowserService — X otherwise sees two different "browsers"
   * for one account and is more likely to flag the session.
   *
   * Connect jobs (no targetAccountId yet) get a username-keyed staging dir
   * so consecutive retries for the same handle keep their warm-up state.
   *
   * Returns a discriminated-union result; never throws on user-input errors
   * (wrong password, captcha, …) — those are mapped to `XLoginFailure`. Only
   * unexpected infrastructure errors propagate.
   *
   * `input.isCancelled` and `input.signal` are checked at every step boundary
   * (see `buildCancelCheck`). When tripped, the login throws
   * `LoginFlowError('cancelled', …)` which the worker maps to a terminal
   * `status='cancelled'` row.
   */
  async run(input: XLoginInput): Promise<XLoginResult> {
    const t0 = Date.now();
    const username = stripAt(input.username);
    const checkCancel = buildCancelCheck(input);

    let context: BrowserContext | null = null;
    let page: Page | null = null;
    try {
      await checkCancel();
      const ctxResult = await buildLoginContext({
        targetAccountId: input.targetAccountId,
        username,
        proxyCountry: input.proxyCountry,
      });
      context = ctxResult.context;
      this.log.log(
        `login start username=${username} profile=${path.basename(ctxResult.profileDir)} ` +
          `headful=${LOGIN_FLAGS.HEADFUL} proxy=${input.proxyCountry ?? 'none'}`,
      );

      page = context.pages()[0] ?? (await context.newPage());
      const onboardingErrors = collectOnboardingErrors(page);

      await checkCancel();
      const preLogin = await tryPreLoginSession(context, page, username);
      if (preLogin) {
        const durationMs = Date.now() - t0;
        this.log.log(`login skipped (session valid) username=${username} screenName=${preLogin.screenName} duration=${durationMs}ms`);
        return {
          ok: true,
          screenName: preLogin.screenName,
          userId: parseUserIdFromTwid(preLogin.cookies.twid) ?? null,
          cookies: preLogin.cookies,
          durationMs,
        };
      }

      await runLoginFlow({
        log: this.log,
        page,
        input: { ...input, username },
        onboardingErrors,
        checkCancel,
      });
      const cookies = await extractCookies(context);
      const screenName = await verifyAuthenticatedSession(context, page, username, cookies);
      const userId = parseUserIdFromTwid(cookies.twid) ?? null;

      const durationMs = Date.now() - t0;
      this.log.log(`login success username=${username} screenName=${screenName} userId=${userId ?? '?'} duration=${durationMs}ms`);
      return { ok: true, screenName, userId, cookies, durationMs };
    } catch (err) {
      const durationMs = Date.now() - t0;
      if (err instanceof LoginFlowError) {
        // Cancellations are a terminal state, not a real failure — skip the
        // debug-artifact dump so we don't leave one screenshot per user
        // cancel sitting in the data dir.
        if (err.reason === 'cancelled') {
          this.log.log(`login cancelled username=${username} detail=${err.detail} duration=${durationMs}ms`);
          return { ok: false, reason: 'cancelled', detail: err.detail, durationMs };
        }
        const detail = await this.decorateFailureDetail(page, input, username, err, durationMs);
        this.log.warn(`login failed username=${username} reason=${err.reason} detail=${detail} duration=${durationMs}ms`);
        return { ok: false, reason: err.reason, detail, durationMs };
      }
      const detail = err instanceof Error ? err.message : String(err);
      this.log.error(`login error username=${username} detail=${detail} duration=${durationMs}ms`);
      return { ok: false, reason: 'unknown', detail: truncate(detail, 300), durationMs };
    } finally {
      try {
        if (context) await context.close();
      } catch {}
    }
  }

  private async decorateFailureDetail(
    page: Page | null,
    input: XLoginInput,
    username: string,
    err: LoginFlowError,
    durationMs: number,
  ): Promise<string> {
    const safeDetail = redactLoginDebugText(err.detail, [username, input.email, input.password, input.totpSecret]);
    if (!page) return safeDetail;

    try {
      const artifact = await writeLoginDebugArtifact({
        page,
        username,
        email: input.email,
        password: input.password,
        totpSecret: input.totpSecret,
        reason: err.reason,
        detail: safeDetail,
        durationMs,
      });
      return artifact ? `${safeDetail} debug_artifact=${artifact.path}` : safeDetail;
    } catch (artifactErr) {
      const artifactDetail = artifactErr instanceof Error ? artifactErr.message : String(artifactErr);
      this.log.warn(`login debug artifact failed username=${username} detail=${truncate(artifactDetail, 160)}`);
      return safeDetail;
    }
  }
}
