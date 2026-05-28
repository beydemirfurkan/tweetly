/**
 * Tailwind class strings for action-lifecycle status pills. Mirrors the
 * backend's ActionStatus enum so the action-queue table shows a consistent
 * palette across screens.
 */

export type ActionStatus =
  | 'pending'
  | 'claimed'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'dead'
  | 'cancelled';

export const ACTION_STATUS_CLASS: Record<ActionStatus, string> = {
  pending: 'border-border bg-muted/50 text-muted-foreground',
  claimed: 'border-amber-500/25 bg-amber-500/10 text-amber-400',
  running: 'border-primary/25 bg-primary/10 text-primary',
  succeeded: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
  failed: 'border-destructive/25 bg-destructive/10 text-destructive',
  dead: 'border-destructive/40 bg-destructive/15 text-destructive font-semibold',
  cancelled: 'border-border bg-muted/30 text-muted-foreground',
};

export function getActionStatusClass(status: string): string {
  return ACTION_STATUS_CLASS[status as ActionStatus] ?? ACTION_STATUS_CLASS.pending;
}
