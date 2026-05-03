import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '../../domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '../../domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '../../action-engine/executor-registry.service';
import { XDirectService } from '../x-direct.service';
import { isAuthRequiredError } from '../browser/x-post-flow.service';

interface BannerUpdatePayload { file_path: string }

@Injectable()
export class BannerUpdateExecutor implements IXActionExecutor<BannerUpdatePayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'banner_update';
  private readonly log = new Logger(BannerUpdateExecutor.name);

  constructor(
    private readonly registry: ExecutorRegistry,
    private readonly xDirect: XDirectService,
  ) {}

  onApplicationBootstrap(): void {
    this.registry.register(this);
  }

  async execute(action: ActionContext<BannerUpdatePayload>, session: XSession): Promise<ExecutionResult> {
    const filePath = action.payload.file_path;
    if (!filePath) {
      return { ok: false, errorClass: 'permanent', message: 'file_path is required' };
    }
    try {
      await this.xDirect.updateBanner(filePath, session.accountId);
      return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isMissingFile = /file not found/i.test(msg);
      const errorClass = isMissingFile ? 'permanent' : isAuthRequiredError(err) ? 'auth' : 'transient';
      this.log.error(`banner_update error: ${msg}`);
      return { ok: false, errorClass, message: msg };
    }
  }
}
