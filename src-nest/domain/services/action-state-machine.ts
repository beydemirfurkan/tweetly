import { Injectable } from '@nestjs/common';
import type { ActionStatus } from '../types/action.types';

const ALLOWED: Record<ActionStatus, readonly ActionStatus[]> = {
  pending: ['claimed', 'cancelled'],
  claimed: ['running', 'pending', 'cancelled'],
  running: ['succeeded', 'failed', 'pending', 'cancelled'],
  succeeded: [],
  failed: ['pending', 'dead'],
  dead: ['pending'],
  cancelled: [],
};

export class InvalidStateTransitionError extends Error {
  constructor(from: ActionStatus, to: ActionStatus) {
    super(`Geçersiz durum geçişi: ${from} → ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

@Injectable()
export class ActionStateMachine {
  canTransition(from: ActionStatus, to: ActionStatus): boolean {
    return ALLOWED[from].includes(to);
  }

  assertTransition(from: ActionStatus, to: ActionStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to);
    }
  }

  isTerminal(status: ActionStatus): boolean {
    return ALLOWED[status].length === 0;
  }
}
