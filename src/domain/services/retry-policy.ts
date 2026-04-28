import { Injectable } from '@nestjs/common';
import type { ErrorClass } from '../types/action.types';

export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
}

const DEAD: RetryDecision = { shouldRetry: false, delayMs: 0 };

@Injectable()
export class RetryPolicy {
  private readonly authRetryMs = 5 * 60 * 1000;
  private readonly transientCapMs = 5 * 60 * 1000;
  private readonly rateLimitFloorMs = 60 * 1000;
  private readonly rateLimitCapMs = 30 * 60 * 1000;

  decide(attempt: number, errorClass: ErrorClass, maxAttempts: number): RetryDecision {
    if (errorClass === 'permanent') return DEAD;
    if (attempt >= maxAttempts) return DEAD;

    if (errorClass === 'auth') {
      return { shouldRetry: true, delayMs: this.authRetryMs };
    }
    if (errorClass === 'rate_limit') {
      const exp = this.rateLimitFloorMs * 2 ** Math.max(0, attempt - 1);
      return { shouldRetry: true, delayMs: Math.min(exp, this.rateLimitCapMs) };
    }
    const base = 1_000 * 2 ** Math.max(0, attempt - 1);
    const jitter = base * 0.3;
    return { shouldRetry: true, delayMs: Math.min(base + Math.random() * jitter, this.transientCapMs) };
  }

  classify(error: Error): ErrorClass {
    const msg = error.message;
    if (msg.startsWith('AUTH_REQUIRED:') || /unauthor|login required|session/i.test(msg)) {
      return 'auth';
    }
    if (/rate.?limit|429/i.test(msg)) return 'rate_limit';
    if (/invalid.+input|validation|exceeds.+character|too long/i.test(msg)) {
      return 'permanent';
    }
    return 'transient';
  }
}
