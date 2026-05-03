import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XDirectProfileService } from '@/x-automation/x-direct';
import { BaseDelegatingExecutor, classifyExecutionError } from './base.executor';

interface BannerUpdatePayload { file_path: string }

@Injectable()
export class BannerUpdateExecutor extends BaseDelegatingExecutor<BannerUpdatePayload> {
  readonly type: ActionType = 'banner_update';

  constructor(
    registry: ExecutorRegistry,
    private readonly xDirect: XDirectProfileService,
  ) {
    super(registry);
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
      const { errorClass: defaultClass, message } = classifyExecutionError(err);
      const errorClass = /file not found/i.test(message) ? 'permanent' : defaultClass;
      this.log.error(`banner_update error: ${message}`);
      return { ok: false, errorClass, message };
    }
  }
}
