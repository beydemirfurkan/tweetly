import { Injectable, Logger } from '@nestjs/common';

const WEBHOOK_TIMEOUT_MS = 10_000;

@Injectable()
export class WebhookDeliveryService {
  private readonly log = new Logger(WebhookDeliveryService.name);

  async deliver(url: string, payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'tweetly-mcp-webhook/1.0',
          'X-Tweetly-Event': String(payload.event ?? 'unknown'),
        },
        body: JSON.stringify(payload),
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
      const msg = err instanceof Error
        ? (err.name === 'AbortError' ? `Timeout after ${WEBHOOK_TIMEOUT_MS}ms` : err.message)
        : String(err);
      this.log.warn(`Webhook delivery error: ${url} → ${msg}`);
      return { ok: false, error: msg };
    } finally {
      clearTimeout(timeout);
    }
  }
}
