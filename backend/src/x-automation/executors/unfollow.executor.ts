import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XDirectService } from '@/x-automation/x-direct.service';
import { BaseDelegatingExecutor, classifyExecutionError } from './base.executor';

interface UnfollowPayload { target_handle: string }

@Injectable()
export class UnfollowExecutor extends BaseDelegatingExecutor<UnfollowPayload> {
  readonly type: ActionType = 'unfollow';

  constructor(
    registry: ExecutorRegistry,
    private readonly xDirect: XDirectService,
  ) {
    super(registry);
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
      const { errorClass, message } = classifyExecutionError(err);
      this.log.error(`unfollow error (${handle}): ${message}`);
      return { ok: false, errorClass, message };
    }
  }
}
