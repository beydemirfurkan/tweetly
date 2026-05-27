import { Inject, Injectable } from '@nestjs/common';
import { ACTION_TYPES, type ActionType } from '@domain/types/action.types';
import { ACTION_STRATEGY, type IActionStrategy } from './action-strategy.port';

@Injectable()
export class ActionStrategyRegistry {
  private readonly map = new Map<ActionType, IActionStrategy>();

  constructor(@Inject(ACTION_STRATEGY) strategies: IActionStrategy[]) {
    for (const s of strategies) {
      if (this.map.has(s.type)) {
        throw new Error(`Duplicate action strategy registered for type=${s.type}`);
      }
      this.map.set(s.type, s);
    }
    const missing = ACTION_TYPES.filter((t) => !this.map.has(t));
    if (missing.length > 0) {
      throw new Error(`Missing action strategies for: ${missing.join(', ')}`);
    }
  }

  forType<TInput extends Parameters<IActionStrategy['idempotencyKey']>[0] = any, TPayload = unknown>(
    type: ActionType,
  ): IActionStrategy<TInput, TPayload> {
    const s = this.map.get(type);
    if (!s) throw new Error(`No strategy registered for action type: ${type}`);
    return s as unknown as IActionStrategy<TInput, TPayload>;
  }

  all(): readonly IActionStrategy[] {
    return [...this.map.values()];
  }
}
