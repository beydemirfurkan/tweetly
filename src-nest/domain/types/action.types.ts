export type ActionType =
  | 'post'
  | 'reply'
  | 'retweet'
  | 'like'
  | 'follow'
  | 'quote'
  | 'bookmark';

export type ActionStatus =
  | 'pending'
  | 'claimed'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'dead'
  | 'cancelled';

export type ErrorClass = 'auth' | 'rate_limit' | 'transient' | 'permanent';

export const ACTION_TYPES: readonly ActionType[] = [
  'post',
  'reply',
  'retweet',
  'like',
  'follow',
  'quote',
  'bookmark',
] as const;

export const ACTION_STATUSES: readonly ActionStatus[] = [
  'pending',
  'claimed',
  'running',
  'succeeded',
  'failed',
  'dead',
  'cancelled',
] as const;

export const ERROR_CLASSES: readonly ErrorClass[] = [
  'auth',
  'rate_limit',
  'transient',
  'permanent',
] as const;
