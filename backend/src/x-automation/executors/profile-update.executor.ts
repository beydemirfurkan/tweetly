import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ActionType } from '../../domain/types/action.types';
import type { ActionContext, ExecutionResult, IXActionExecutor, XSession } from '../../domain/ports/x-action-executor.port';
import { ExecutorRegistry } from '../../action-engine/executor-registry.service';
import { XDirectService } from '../x-direct.service';
import { isAuthRequiredError } from '../browser/x-post-flow.service';

interface ProfileUpdatePayload {
  fields: {
    name?: string;
    bio?: string;
    location?: string;
    website?: string;
  };
}

@Injectable()
export class ProfileUpdateExecutor implements IXActionExecutor<ProfileUpdatePayload>, OnApplicationBootstrap {
  readonly type: ActionType = 'profile_update';
  private readonly log = new Logger(ProfileUpdateExecutor.name);

  constructor(
    private readonly registry: ExecutorRegistry,
    private readonly xDirect: XDirectService,
  ) {}

  onApplicationBootstrap(): void {
    this.registry.register(this);
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
      const msg = err instanceof Error ? err.message : String(err);
      const errorClass = isAuthRequiredError(err) ? 'auth' : 'transient';
      this.log.error(`profile_update error: ${msg}`);
      return { ok: false, errorClass, message: msg };
    }
  }
}
