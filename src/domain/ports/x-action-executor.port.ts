import type { ActionType, ErrorClass } from '../types/action.types';

export interface XSession {
  accountId: string;
  authToken: string;
  ct0?: string | null;
  twid?: string | null;
}

export interface ExecutionSuccess {
  ok: true;
  result: ExecutionResultPayload;
}

export interface ExecutionFailure {
  ok: false;
  errorClass: ErrorClass;
  message: string;
}

export type ExecutionResult = ExecutionSuccess | ExecutionFailure;

export type ExecutionResultPayload =
  | { kind: 'tweet'; tweetId: string; tweetUrl: string; sentAt: string }
  | { kind: 'engagement'; at: string };

export interface ActionContext<TPayload = unknown> {
  id: string;
  type: ActionType;
  accountId: string;
  attempts: number;
  payload: TPayload;
  metadata: Record<string, unknown>;
}

export interface IXActionExecutor<TPayload = unknown> {
  readonly type: ActionType;
  execute(action: ActionContext<TPayload>, session: XSession): Promise<ExecutionResult>;
}

export const X_ACTION_EXECUTOR = Symbol('IXActionExecutor');
