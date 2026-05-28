/**
 * Tailwind class strings for X account status pills. Single-sourced here so
 * every screen that renders an account status badge picks up the same
 * border/bg/text combination — and so a future palette change is one edit
 * instead of a grep.
 */

export type AccountStatus = 'active' | 'paused' | 'banned';

export const ACCOUNT_STATUS_CLASS: Record<AccountStatus, string> = {
  active: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
  paused: 'border-amber-500/25 bg-amber-500/10 text-amber-400',
  banned: 'border-destructive/25 bg-destructive/10 text-destructive',
};

/** Falls back to the paused palette for unknown statuses (less alarming than success/error). */
export function getAccountStatusClass(status: string): string {
  return ACCOUNT_STATUS_CLASS[status as AccountStatus] ?? ACCOUNT_STATUS_CLASS.paused;
}

export function accountStatusLabelKey(
  status: string,
): 'statusActive' | 'statusPaused' | 'statusBanned' {
  if (status === 'active') return 'statusActive';
  if (status === 'banned') return 'statusBanned';
  return 'statusPaused';
}
