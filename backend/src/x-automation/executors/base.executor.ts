import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType, ErrorClass } from '@domain/types/action.types';
import type {
  ActionContext,
  ExecutionResult,
  IXActionExecutor,
  XSession,
} from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { envBackedConfig } from '@/config/process-env-shim';
import { isAuthRequiredError } from '@/x-automation/browser/x-post-flow.service';

/**
 * Shared scaffolding for the three executor flavors:
 *   - patchright: real browser, only when X_EXECUTOR_MODE=patchright
 *   - noop:       dry-run, only when X_EXECUTOR_MODE=noop
 *   - delegating: forwards to a service that already mode-switches; always
 *                 registered so the queue drains regardless of mode.
 *
 * Concrete classes override `mode` to gate registration; the lifecycle hook
 * lives here so 22 executors stop carrying identical onApplicationBootstrap
 * bodies.
 */
export abstract class BaseExecutor<P>
  implements IXActionExecutor<P>, OnApplicationBootstrap
{
  abstract readonly type: ActionType;
  protected abstract readonly mode: 'patchright' | 'noop' | 'always';
  protected readonly log: Logger;

  constructor(protected readonly registry: ExecutorRegistry) {
    this.log = new Logger(this.constructor.name);
  }

  onApplicationBootstrap(): void {
    if (this.shouldRegister()) this.registry.register(this);
  }

  abstract execute(action: ActionContext<P>, session: XSession): Promise<ExecutionResult>;

  private shouldRegister(): boolean {
    if (this.mode === 'always') return true;
    return envBackedConfig().raw('X_EXECUTOR_MODE') === this.mode;
  }
}

export abstract class BasePatchrightExecutor<P> extends BaseExecutor<P> {
  protected readonly mode = 'patchright' as const;
}

export abstract class BaseNoopExecutor<P> extends BaseExecutor<P> {
  protected readonly mode = 'noop' as const;
}

export abstract class BaseDelegatingExecutor<P> extends BaseExecutor<P> {
  protected readonly mode = 'always' as const;
}

/**
 * Wraps a delegated service call with the shared error classification.
 * `auth-required` → errorClass=auth so the engine pauses the account; any
 * other thrown error is treated as transient (retryable).
 */
export function classifyExecutionError(err: unknown): {
  errorClass: ErrorClass;
  message: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  const errorClass: ErrorClass = isAuthRequiredError(err) ? 'auth' : 'transient';
  return { errorClass, message };
}
