import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XDirectService } from '@/x-automation/x-direct.service';
import { isAuthRequiredError } from '@/x-automation/browser/x-post-flow.service';

interface AvatarUpdatePayload { file_path: string }

@Injectable()
export class AvatarUpdateExecutor implements IXActionExecutor<AvatarUpdatePayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'avatar_update';
  private readonly log = new Logger(AvatarUpdateExecutor.name);

  constructor(
    private readonly registry: ExecutorRegistry,
    private readonly xDirect: XDirectService,
  ) {}

  onApplicationBootstrap(): void {
    this.registry.register(this);
  }

  async execute(action: ActionContext<AvatarUpdatePayload>, session: XSession): Promise<ExecutionResult> {
    const filePath = action.payload.file_path;
    if (!filePath) {
      return { ok: false, errorClass: 'permanent', message: 'file_path is required' };
    }
    try {
      await this.xDirect.updateAvatar(filePath, session.accountId);
      return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // ENOENT-style file errors are permanent — no point retrying.
      const isMissingFile = /file not found/i.test(msg);
      const errorClass = isMissingFile ? 'permanent' : isAuthRequiredError(err) ? 'auth' : 'transient';
      this.log.error(`avatar_update error: ${msg}`);
      return { ok: false, errorClass, message: msg };
    }
  }
}
