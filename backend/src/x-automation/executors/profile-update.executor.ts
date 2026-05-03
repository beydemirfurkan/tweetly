import { Injectable } from '@nestjs/common';
import type { ActionType } from '@domain/types/action.types';
import type { ActionContext, ExecutionResult, XSession } from '@domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '@/action-engine/executor-registry.service';
import { XDirectService } from '@/x-automation/x-direct.service';
import { BaseDelegatingExecutor, classifyExecutionError } from './base.executor';

interface ProfileUpdatePayload {
  fields: {
    name?: string;
    bio?: string;
    location?: string;
    website?: string;
  };
}

@Injectable()
export class ProfileUpdateExecutor extends BaseDelegatingExecutor<ProfileUpdatePayload> {
  readonly type: ActionType = 'profile_update';

  constructor(
    registry: ExecutorRegistry,
    private readonly xDirect: XDirectService,
  ) {
    super(registry);
  }

  async execute(action: ActionContext<ProfileUpdatePayload>, session: XSession): Promise<ExecutionResult> {
    // The DB column stores JSON; TypeORM/PG returns it parsed already, but
    // some action-runner paths replay raw rows where it could be a string.
    const fields =
      typeof action.payload.fields === 'string'
        ? (JSON.parse(action.payload.fields as unknown as string) as ProfileUpdatePayload['fields'])
        : action.payload.fields;
    if (!fields || !Object.values(fields).some(Boolean)) {
      return { ok: false, errorClass: 'permanent', message: 'no profile fields to update' };
    }
    try {
      await this.xDirect.updateProfile(fields, session.accountId);
      return { ok: true, result: { kind: 'engagement', at: new Date().toISOString() } };
    } catch (err) {
      const { errorClass, message } = classifyExecutionError(err);
      this.log.error(`profile_update error: ${message}`);
      return { ok: false, errorClass, message };
    }
  }
}
