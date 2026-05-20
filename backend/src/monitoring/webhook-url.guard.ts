import { lookup } from 'dns/promises';
import { isIPv4 } from 'net';

/**
 * SSRF protection for webhook URLs.
 *
 * Validates that the hostname of the given URL does not resolve to a
 * private, loopback, link-local, or otherwise internal IP address.
 *
 * Blocked ranges:
 *   127.0.0.0/8      — loopback
 *   10.0.0.0/8       — private (RFC 1918)
 *   172.16.0.0/12    — private (RFC 1918)
 *   192.168.0.0/16   — private (RFC 1918)
 *   169.254.0.0/16   — link-local (AWS metadata, GCP metadata)
 *   ::1              — IPv6 loopback
 *   fc00::/7         — IPv6 unique local
 *   fe80::/10        — IPv6 link-local
 */

const PRIVATE_RANGES: Array<{ base: number; mask: number }> = [
  { base: ipToInt('127.0.0.0'), mask: 0xff000000 },    // 127.0.0.0/8
  { base: ipToInt('10.0.0.0'), mask: 0xff000000 },     // 10.0.0.0/8
  { base: ipToInt('172.16.0.0'), mask: 0xfff00000 },   // 172.16.0.0/12
  { base: ipToInt('192.168.0.0'), mask: 0xffff0000 },  // 192.168.0.0/16
  { base: ipToInt('169.254.0.0'), mask: 0xffff0000 },  // 169.254.0.0/16
];

function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const intIp = ipToInt(ip);
  return PRIVATE_RANGES.some(({ base, mask }) => (intIp & mask) === (base & mask));
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // Loopback
  if (lower === '::1') return true;
  // Unique local (fc00::/7)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // Link-local (fe80::/10)
  if (lower.startsWith('fe80')) return true;
  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  const v4Mapped = lower.match(/^::ffff:(.+)$/);
  if (v4Mapped && isIPv4(v4Mapped[1])) return isPrivateIPv4(v4Mapped[1]);
  return false;
}

export class WebhookUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookUrlError';
  }
}

/**
 * Validates that a webhook URL does not resolve to a private/internal IP.
 * Throws WebhookUrlError if the URL resolves to a blocked range.
 */
export async function assertPublicWebhookUrl(urlStr: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new WebhookUrlError(`Invalid URL: ${urlStr}`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new WebhookUrlError('Webhook URL must use http or https protocol');
  }

  const hostname = parsed.hostname;

  // If hostname is already an IP literal, check directly
  if (isIPv4(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new WebhookUrlError(`Webhook URL resolves to a private IP: ${hostname}`);
    }
    return;
  }

  // Check for IPv6 literal (strip brackets)
  const ipv6 = hostname.replace(/^\[|\]$/g, '');
  if (ipv6.includes(':')) {
    if (isPrivateIPv6(ipv6)) {
      throw new WebhookUrlError(`Webhook URL resolves to a private IP: ${hostname}`);
    }
    return;
  }

  // Resolve hostname via DNS
  try {
    const { address } = await lookup(hostname);
    if (isIPv4(address)) {
      if (isPrivateIPv4(address)) {
        throw new WebhookUrlError(
          `Webhook hostname "${hostname}" resolves to private IP ${address}`,
        );
      }
    } else {
      if (isPrivateIPv6(address)) {
        throw new WebhookUrlError(
          `Webhook hostname "${hostname}" resolves to private IP ${address}`,
        );
      }
    }
  } catch (err) {
    if (err instanceof WebhookUrlError) throw err;
    throw new WebhookUrlError(`Failed to resolve webhook hostname "${hostname}": ${(err as Error).message}`);
  }
}
