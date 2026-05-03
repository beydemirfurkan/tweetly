import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XDirectWriteService } from '@/x-automation/x-direct';
import { BaseDelegatingExecutor, classifyExecutionError } from './base.executor';

interface DmPayload { target_handle: string; message: string }

@Injectable()
export class DmExecutor extends BaseDelegatingExecutor<DmPayload> {
  readonly type: ActionType = 'dm';

  constructor(
    registry: ExecutorRegistry,
    private readonly xDirect: XDirectWriteService,
  ) {
    super(registry);
  }

  async execute(action: ActionContext<DmPayload>, session: XSession): Promise<ExecutionResult> {
    const { target_handle, message } = action.payload;
    if (!target_handle?.trim() || !message?.trim()) {
      return { ok: false, errorClass: 'permanent', message: 'target_handle and message are required' };
    }
    try {
      await this.xDirect.sendDm(target_handle, message, session.accountId);
      return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
    } catch (err) {
      const { errorClass, message: msg } = classifyExecutionError(err);
      this.log.error(`dm error (${target_handle}): ${msg}`);
      return { ok: false, errorClass, message: msg };
    }
  }
}
