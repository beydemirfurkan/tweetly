import { ExecutionContext, HttpException, Injectable, applyDecorators } from '@nestjs/common';
import { Throttle, ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthedRequest } from './api-key.guard';

/**
 * xquik-modeli rate limiter.
 * Per-user (req.tweetlyAuth.userId) tracker; IP fallback for unauthenticated requests.
 * Tier limits are applied via @RateLimitRead / @RateLimitWrite / @RateLimitDelete /
 * @RateLimitConnect / @RateLimitFollow factories below.
 *
 * 429 body matches xquik:  { error: "rate_limit_exceeded", retryAfter, statusCode }
 * Retry-After response header is set automatically by ThrottlerGuard.
 */
@Injectable()
export class TieredThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const ctx = (req as AuthedRequest).tweetlyAuth;
    if (ctx?.userId) return `user:${ctx.userId}`;
    const xff = req.headers['x-forwarded-for'];
    const fwd = typeof xff === 'string' ? xff.split(',')[0]?.trim() : Array.isArray(xff) ? xff[0] : '';
    return `ip:${fwd || req.ip || 'anon'}`;
  }

  protected async throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    // ThrottlerLimitDetail.timeToExpire / timeToBlockExpire are in seconds.
    const retryAfter = Math.max(
      1,
      detail.timeToBlockExpire || detail.timeToExpire,
    );
    throw new HttpException(
      {
        error: 'rate_limit_exceeded',
        retryAfter,
        statusCode: 429,
      },
      429,
    );
  }
}

// ── Tier decorator factories (xquik mirror) ─────────────────────────────────

/** Read tier: 120 requests / 60s */
export const RateLimitRead = () =>
  applyDecorators(Throttle({ default: { ttl: 60_000, limit: 120 } }));

/** Write tier: 30 requests / 60s (also the ThrottlerModule default) */
export const RateLimitWrite = () =>
  applyDecorators(Throttle({ default: { ttl: 60_000, limit: 30 } }));

/** Delete tier: 15 requests / 60s */
export const RateLimitDelete = () =>
  applyDecorators(Throttle({ default: { ttl: 60_000, limit: 15 } }));

/** Account connect override: 3 requests / 15 minutes */
export const RateLimitConnect = () =>
  applyDecorators(Throttle({ default: { ttl: 900_000, limit: 3 } }));

/** Follow action override: 20 / 60s + 400 / day */
export const RateLimitFollow = () =>
  applyDecorators(
    Throttle({
      default: { ttl: 60_000, limit: 20 },
      daily: { ttl: 86_400_000, limit: 400 },
    }),
  );

/** Magic-link request override: 5 / 60s per IP (anti-mail-bombing) */
export const RateLimitMagicLink = () =>
  applyDecorators(Throttle({ default: { ttl: 60_000, limit: 5 } }));
