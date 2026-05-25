import { z } from 'zod';

/**
 * Shared primitives used across tool schemas. A tweet_url tightening (or a
 * handle regex tweak) here ripples to every tool that imports the field.
 */

export const tweetUrl = z
  .string()
  .min(1)
  .regex(/\/status\/\d+/, 'tweet_url must contain /status/')
  .describe('Tweet URL (must contain /status/)');

// X handles: 1–15 chars, [A-Za-z0-9_]. Allow an optional leading @ — the
// transformer strips it so handlers see a canonical form.
export const xHandle = z
  .string()
  .trim()
  .transform((s) => s.replace(/^@/, ''))
  .pipe(z.string().min(1).max(15).regex(/^[A-Za-z0-9_]+$/, 'invalid handle'))
  .describe('X handle (without leading @)');

export const accountId = z
  .string()
  .min(1)
  .optional()
  .describe('Account ID (uses first active account if omitted)');

export const limit = (max: number, defaultDescription = `Max items to return (1–${max})`) =>
  z.number().int().min(1).max(max).optional().describe(defaultDescription);

export const monitorId = z.string().min(1).describe('Monitor ID');

export const filePath = z.string().min(1).describe('Local file path');

export const verifiedOnly = z.boolean().optional().describe('Filter to verified accounts only');

export const cursor = z
  .string()
  .min(1)
  .optional()
  .describe('Opaque cursor from a previous response (echo nextCursor verbatim)');

// Numeric X list ID — used by every list-* schema.
export const listIdField = z
  .string()
  .regex(/^\d+$/, 'list_id must be numeric')
  .describe('Numeric X list ID');

// Base32 RFC4648 alphabet, padding optional. Must be at least 16 chars
// (the 80-bit minimum for TOTP).
export const base32Secret = z
  .string()
  .trim()
  .regex(/^[A-Z2-7]+=*$/, 'totp_secret must be base32 (RFC4648)')
  .refine((s) => s.replace(/=+$/, '').length >= 16, {
    message: 'totp_secret too short (need 16+ base32 chars)',
  })
  .describe('TOTP secret as base32 RFC4648 (16+ chars)');
