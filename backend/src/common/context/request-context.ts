import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export interface RequestContextState {
  correlationId: string;
  userId?: string;
  accountId?: string;
}

/**
 * Per-request store backed by AsyncLocalStorage. The middleware seeds the
 * context with a correlationId; downstream auth guards or controllers fill
 * in userId/accountId by mutating the live state. Reads return `undefined`
 * outside any HTTP request — workers and bootstrap code must tolerate that.
 */
@Injectable()
export class RequestContext {
  private readonly als = new AsyncLocalStorage<RequestContextState>();

  run<T>(state: RequestContextState, fn: () => T): T {
    return this.als.run(state, fn);
  }

  current(): RequestContextState | undefined {
    return this.als.getStore();
  }

  correlationId(): string | undefined {
    return this.als.getStore()?.correlationId;
  }

  userId(): string | undefined {
    return this.als.getStore()?.userId;
  }

  accountId(): string | undefined {
    return this.als.getStore()?.accountId;
  }

  setUserId(userId: string): void {
    const s = this.als.getStore();
    if (s) s.userId = userId;
  }

  setAccountId(accountId: string): void {
    const s = this.als.getStore();
    if (s) s.accountId = accountId;
  }
}

export function newCorrelationId(seed?: string): string {
  if (seed && /^[A-Za-z0-9_\-:.]{8,128}$/.test(seed)) return seed;
  return randomUUID();
}
