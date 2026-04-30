export type AccountStatus = 'active' | 'paused' | 'banned';

export const ACCOUNT_STATUSES: readonly AccountStatus[] = [
  'active',
  'paused',
  'banned',
] as const;
