import { z } from 'zod';
import { ACTION_TYPES, ACTION_STATUSES } from '@domain/types/action.types';
import { accountId, base32Secret } from './common';

export const getAccounts = z.object({}).strict();
export const getAccountHealth = z.object({ account_id: accountId });

export const connectXAccount = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.replace(/^@/, '').toLowerCase())
    .describe('X username to log in as (with or without leading @)'),
  email: z.email().optional().describe('Recovery email if X prompts for verification'),
  password: z.string().min(1).describe('Password — encrypted at rest, never logged'),
  totp_secret: base32Secret.optional(),
  save_totp_secret: z.boolean().optional().describe('Persist totp_secret encrypted on the account row'),
});
export const reauthXAccount = z.object({
  account_id: z.string().min(1).describe('ID of the existing account to re-authenticate'),
  password: z.string().min(1).describe('Fresh password for the same account'),
  totp_secret: base32Secret.optional(),
  save_totp_secret: z.boolean().optional(),
  email: z.email().optional(),
});
export const getXLoginJob = z.object({
  job_id: z.string().min(1).describe('Login job ID returned by connect_x_account / reauth_x_account'),
});

export const listActions = z.object({
  type: z.enum(ACTION_TYPES as readonly [string, ...string[]]).describe('Action type'),
  status: z
    .enum(ACTION_STATUSES as readonly [string, ...string[]])
    .optional()
    .describe('Filter by status'),
  account_id: accountId,
  limit: z.number().int().min(1).max(200).optional().describe('Max rows (1–200)'),
});
export const cancelAction = z.object({
  type: z.enum(ACTION_TYPES as readonly [string, ...string[]]).describe('Action type'),
  action_id: z.string().min(1).describe('Action ID to cancel'),
});
export const replayAction = z.object({
  type: z.enum(ACTION_TYPES as readonly [string, ...string[]]).describe('Action type'),
  action_id: z.string().min(1).describe('Action ID to replay (must be dead/failed/cancelled)'),
});

export const getSettings = z.object({
  account_id: z.string().min(1).describe('Account ID to fetch settings for'),
});
export const updateSettings = z.object({
  settings: z
    .record(z.string(), z.unknown())
    .describe('Key-value map of settings to upsert'),
  account_id: z.string().min(1).describe('Account ID owning the settings'),
});
