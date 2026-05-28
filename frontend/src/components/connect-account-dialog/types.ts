import type {
  LoginCooldownPayload,
  LoginJobResponse,
} from '@/lib/api';

export type Mode = 'connect' | 'reauth';

export interface FormState {
  username: string;
  email: string;
  password: string;
  totpSecret: string;
  saveTotpSecret: boolean;
}

export const EMPTY_FORM: FormState = {
  username: '',
  email: '',
  password: '',
  totpSecret: '',
  saveTotpSecret: false,
};

export interface AlreadyConnectedPayload {
  code: 'account_already_connected';
  existingAccountId: string;
}

export function isAlreadyConnectedPayload(value: unknown): value is AlreadyConnectedPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.code === 'account_already_connected' && typeof v.existingAccountId === 'string';
}

/**
 * Discriminated state machine for the dialog. The state transitions are
 * intentionally one-way (idle → submitting → polling → terminal); the
 * dialog re-mounts to reset.
 */
export type Phase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'polling'; jobId: string; status: LoginJobResponse['status']; cancelling: boolean }
  | { kind: 'success'; targetAccountId: string }
  | { kind: 'failed'; reason: NonNullable<LoginJobResponse['failureReason']>; detail: string | null }
  | { kind: 'cancelled' }
  | { kind: 'cooldown'; payload: LoginCooldownPayload }
  | { kind: 'alreadyConnected'; existingAccountId: string };
