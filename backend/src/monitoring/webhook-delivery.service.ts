import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { assertPublicWebhookUrl, WebhookUrlError } from './webhook-url.guard';

const WEBHOOK_TIMEOUT_MS = 10_000;
export const SIGNATURE_HEADER = 'X-Tweetly-Signature';
export const SIGNATURE_SCHEME = 'v1';

export interface DeliveryResult {
  ok: boolean;
  error?: string;
}

@Injectable()
export class WebhookDeliveryService {
  private readonly log = new Logger(WebhookDeliveryService.name);

  async deliver(
    url: string,
    payload: Record<string, unknown>,
    secret: string | null,
  ): Promise<DeliveryResult> {
    // SSRF protection: reject URLs that resolve to private/internal IPs
    try {
      await assertPublicWebhookUrl(url);
    } catch (err) {
      const msg = err instanceof WebhookUrlError ? err.message : String(err);
      this.log.warn(`Webhook URL rejected (SSRF protection): ${url} → ${msg}`);
      return { ok: false, error: msg };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    const body = JSON.stringify(payload);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'xtweetly-mcp-webhook/1.0',
      'X-Tweetly-Event': String(payload.event ?? 'unknown'),
    };

    if (secret) {
      const ts = Math.floor(Date.now() / 1000).toString();
      const signature = sign(secret, ts, body);
      headers[SIGNATURE_HEADER] = `t=${ts},${SIGNATURE_SCHEME}=${signature}`;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = `HTTP ${res.status} ${res.statusText}`;
        this.log.warn(`Webhook delivery failed: ${url} → ${err}`);
        return { ok: false, error: err };
      }

      this.log.log(`Webhook delivered: ${url} → ${res.status}`);
      return { ok: true };
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === 'AbortError'
            ? `Timeout after ${WEBHOOK_TIMEOUT_MS}ms`
            : err.message
          : String(err);
      this.log.warn(`Webhook delivery error: ${url} → ${msg}`);
      return { ok: false, error: msg };
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Receivers verify the signature like this (Node example):
 *
 *   const [tPart, vPart] = header.split(',');
 *   const ts = tPart.split('=')[1];
 *   const sig = vPart.split('=')[1];
 *   const expected = crypto
 *     .createHmac('sha256', WEBHOOK_SECRET)
 *     .update(`${ts}.${rawBody}`)
 *     .digest('hex');
 *   if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) reject();
 *   if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) reject();   // 5min skew
 */
function sign(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}
