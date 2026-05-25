import { z } from 'zod';
import { accountId, monitorId, xHandle } from './common';

export const createMonitor = z.object({
  target_handle: xHandle.describe('Handle of the account to monitor'),
  webhook_url: z
    .url()
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
      message: 'webhook_url must be a valid HTTP/HTTPS URL',
    })
    .describe('HTTP/HTTPS URL to POST events to'),
  account_id: accountId,
  event_types: z
    .array(z.literal('tweet.new'))
    .optional()
    .describe('Subscribe to specific event types (default: all)'),
});
export const listMonitors = z.object({}).strict();
export const getMonitor = z.object({ monitor_id: monitorId });
export const rotateSecret = z.object({ monitor_id: monitorId });
export const deleteMonitor = z.object({ monitor_id: monitorId });
export const pauseMonitor = z.object({ monitor_id: monitorId });
