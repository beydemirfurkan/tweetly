import { Injectable, Logger } from '@nestjs/common';
import type { ActionType } from '../domain/types/action.types';
import type { IXActionExecutor } from '../domain/ports/x-action-executor.port';

@Injectable()
export class ExecutorRegistry {
  private readonly log = new Logger(ExecutorRegistry.name);
  private readonly map = new Map<ActionType, IXActionExecutor>();

  register(executor: IXActionExecutor): void {
    if (this.map.has(executor.type)) {
      this.log.warn(`Executor for ${executor.type} already registered, overwriting.`);
    }
    this.map.set(executor.type, executor);
    this.log.log(`Registered executor: ${executor.type}`);
  }

  resolve(type: ActionType): IXActionExecutor | undefined {
    return this.map.get(type);
  }

  resolveOrThrow(type: ActionType): IXActionExecutor {
    const e = this.map.get(type);
    if (!e) throw new Error(`No executor registered for action type: ${type}`);
    return e;
  }

  registered(): ActionType[] {
    return [...this.map.keys()];
  }
}
