import { Logger } from '@nestjs/common';
import type { Page } from 'patchright';
import { LoginFlowError } from './login-error';
import { captureDebug } from './login-page.utils';
import { truncate } from './login-classifiers';
import type { XLoginInput } from './login.types';

/**
 * Probe called between login steps. Throws `LoginFlowError('cancelled', …)`
 * if the worker observed the row was cancelled by the user OR the shutdown
 * abort signal fired. No-op for callers that didn't wire either source
 * (e.g. smoke scripts) — they get the legacy "runs to completion" behavior.
 */
export type CancelCheck = () => Promise<void>;

export interface StepOptions {
  log: Logger;
  page?: Page;
  checkCancel?: CancelCheck;
}

/**
 * Wraps a single login-flow step with timing, cancellation probe, and a
 * best-effort page-state snapshot when the step throws something other
 * than a `LoginFlowError`. Lets the flow runner stay declarative without
 * repeating the same try/catch + debug-capture every place.
 */
export async function runStep<T>(name: string, fn: () => Promise<T>, opts: StepOptions): Promise<T> {
  if (opts.checkCancel) await opts.checkCancel();
  const t = Date.now();
  try {
    const out = await fn();
    opts.log.debug(`step=${name} ok duration=${Date.now() - t}ms`);
    return out;
  } catch (err) {
    if (err instanceof LoginFlowError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    let extra = '';
    if (opts.page) {
      try {
        const ctx = await captureDebug(opts.page);
        if (ctx) extra = ` ${ctx}`;
      } catch {}
    }
    throw new LoginFlowError('unknown', `step ${name}: ${truncate(msg, 160)}${extra}`);
  }
}

/**
 * Build the per-call cancel probe from the optional `isCancelled` and
 * `signal` inputs. When neither is provided this is a no-op closure so the
 * critical step path stays branch-free.
 */
export function buildCancelCheck(input: XLoginInput): CancelCheck {
  const signal = input.signal;
  const isCancelled = input.isCancelled;
  if (!signal && !isCancelled) {
    return async () => {};
  }
  return async () => {
    if (signal?.aborted) {
      throw new LoginFlowError('cancelled', 'login aborted (shutdown signal)');
    }
    if (isCancelled && (await isCancelled())) {
      throw new LoginFlowError('cancelled', 'login cancelled by user');
    }
  };
}
