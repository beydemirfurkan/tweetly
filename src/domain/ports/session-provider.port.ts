import type { XSession } from './x-action-executor.port';

export interface ISessionProvider {
  resolve(accountId: string): Promise<XSession>;
  persistRefresh(accountId: string, ct0: string | null, twid: string | null): Promise<void>;
}

export const SESSION_PROVIDER = Symbol('ISessionProvider');
