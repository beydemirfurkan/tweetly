export interface CircuitBreakerSnapshot {
  paused: boolean;
  reason?: string;
  pausedAt?: string;
  pauseUntil?: string;
  consecutiveFailures: number;
  lastFailureAt?: string;
  lastFailure?: string;
  lastSuccessAt?: string;
}

export interface ICircuitBreaker {
  isPaused(accountId: string, now?: Date): Promise<boolean>;
  load(accountId: string): Promise<CircuitBreakerSnapshot>;
  recordSuccess(accountId: string): Promise<void>;
  recordFailure(accountId: string, message: string): Promise<CircuitBreakerSnapshot>;
}

export const CIRCUIT_BREAKER = Symbol('ICircuitBreaker');
