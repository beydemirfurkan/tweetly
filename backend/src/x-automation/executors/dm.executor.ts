import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XDirectService } from '@/x-automation/x-direct.service';
import { isAuthRequiredError } from '@/x-automation/browser/x-post-flow.service';

interface DmPayload { target_handle: string; message: string }

@Injectable()
export class DmExecutor implements IXActionExecutor<DmPayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'dm';
  private readonly log = new Logger(DmExecutor.name);

  constructor(
    private readonly registry: ExecutorRegistry,
    private readonly xDirect: XDirectService,
  ) {}

  onApplicationBootstrap(): void {
    this.registry.register(this);
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
      const msg = err instanceof Error ? err.message : String(err);
      const errorClass = isAuthRequiredError(err) ? 'auth' : 'transient';
      this.log.error(`dm error (${target_handle}): ${msg}`);
      return { ok: false, errorClass, message: msg };
    }
  }
}
