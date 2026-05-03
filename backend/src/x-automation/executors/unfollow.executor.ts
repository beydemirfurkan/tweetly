import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '../../domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '../../domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '../../action-engine/executor-registry.service';
import { XDirectService } from '../x-direct.service';
import { isAuthRequiredError } from '../browser/x-post-flow.service';

interface UnfollowPayload { target_handle: string }

@Injectable()
export class UnfollowExecutor implements IXActionExecutor<UnfollowPayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'unfollow';
  private readonly log = new Logger(UnfollowExecutor.name);

  constructor(
    private readonly registry: ExecutorRegistry,
    private readonly xDirect: XDirectService,
  ) {}

  onApplicationBootstrap(): void {
    this.registry.register(this);
  }

  async execute(action: ActionContext<UnfollowPayload>, session: XSession): Promise<ExecutionResult> {
    const handle = action.payload.target_handle;
    if (!handle?.trim()) {
      return { ok: false, errorClass: 'permanent', message: 'target_handle is empty' };
    }
    try {
      await this.xDirect.unfollowAccount(handle, session.accountId);
      return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errorClass = isAuthRequiredError(err) ? 'auth' : 'transient';
      this.log.error(`unfollow error (${handle}): ${msg}`);
      return { ok: false, errorClass, message: msg };
    }
  }
}
