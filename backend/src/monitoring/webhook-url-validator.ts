import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import { envBackedConfig } from '@/config/process-env-shim';

/**
 * Outcome of a webhook URL safety check. Callers translate `ok=false`
 * to BadRequestException at create time or a delivery skip at runtime.
 */
export type WebhookUrlCheck =
  | { ok: true; resolvedIps: string[] }
  | { ok: false; reason: string; detail?: string };

interface ValidatorOptions {
  /** `production` => https-only by default (override with allowHttp=true). */
  nodeEnv?: string;
  /** Treats http:// loopback as safe — only meaningful for self-hosted dev. */
  allowHttp?: boolean;
  /** Comma-separated hostnames that bypass the SSRF check (e.g. for known tenant gateways). */
  hostAllowlist?: string;
  /** Comma-separated hostnames that are always rejected regardless of resolution. */
  hostBlocklist?: string;
}

/**
 * Reject webhook URLs that would let a tenant make the backend speak
 * to its own internal network (cloud-metadata, redis, postgres, admin
 * API, etc.). Defends against the confused-deputy SSRF pattern.
 *
 * - URL must be http or https
 * - In production: https only, unless `allowHttp` is set
 * - Hostname must not be a private / loopback / link-local IP literal
 *   (in canonical or octal/hex/decimal-int forms)
 * - Hostname must resolve, and every resolved A/AAAA must be a public IP
 * - Optional hostname allowlist / blocklist
 *
 * The same check is run at create time (BadRequestException) AND at
 * delivery time, so a DNS rebind after the create call is also rejected.
 */
export async function checkWebhookUrl(
  url: string,
  options: ValidatorOptions = {},
): Promise<WebhookUrlCheck> {
  const opts = resolveOptions(options);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'invalid_url', detail: 'not a valid URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported_scheme', detail: parsed.protocol };
  }

  if (parsed.protocol === 'http:' && opts.requireHttps && !opts.allowHttp) {
    return { ok: false, reason: 'http_not_allowed_in_production', detail: parsed.protocol };
  }

  // WHATWG URL keeps the [] around IPv6 literals; strip them so the
  // downstream IP checks see the bare address.
  const rawHost = stripIpv6Brackets(parsed.hostname);
  if (!rawHost) return { ok: false, reason: 'missing_host' };

  if (opts.blocklist.has(rawHost.toLowerCase())) {
    return { ok: false, reason: 'host_blocklisted', detail: rawHost };
  }

  if (opts.allowlist.has(rawHost.toLowerCase())) {
    return { ok: true, resolvedIps: [] };
  }

  // Hostname is itself an IP literal — normalize any obfuscated form
  // (octal, hex, decimal-int, IPv4-mapped IPv6) to canonical before checking.
  const literal = normalizeIpLiteral(rawHost);
  if (literal) {
    if (isPrivateIp(literal)) {
      return { ok: false, reason: 'private_ip_literal', detail: literal };
    }
    return { ok: true, resolvedIps: [literal] };
  }

  let resolved: { address: string }[];
  try {
    resolved = await dns.lookup(rawHost, { all: true, verbatim: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'dns_lookup_failed', detail: msg };
  }

  if (resolved.length === 0) {
    return { ok: false, reason: 'dns_no_addresses', detail: rawHost };
  }

  const privates = resolved.map((r) => r.address).filter(isPrivateIp);
  if (privates.length > 0) {
    return {
      ok: false,
      reason: 'private_ip_resolved',
      detail: `${rawHost} → ${privates.join(', ')}`,
    };
  }

  return { ok: true, resolvedIps: resolved.map((r) => r.address) };
}

interface ResolvedOptions {
  requireHttps: boolean;
  allowHttp: boolean;
  allowlist: Set<string>;
  blocklist: Set<string>;
}

function resolveOptions(o: ValidatorOptions): ResolvedOptions {
  const config = envBackedConfig();
  const env = (o.nodeEnv ?? config.getString('NODE_ENV', 'development')).toLowerCase();
  return {
    requireHttps: env === 'production',
    allowHttp: o.allowHttp ?? config.getString('ALLOW_HTTP_WEBHOOK', '') === 'true',
    allowlist: parseHostList(o.hostAllowlist ?? config.getOptionalString('WEBHOOK_HOST_ALLOWLIST') ?? undefined),
    blocklist: parseHostList(o.hostBlocklist ?? config.getOptionalString('WEBHOOK_HOST_BLOCKLIST') ?? undefined),
  };
}

function parseHostList(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(raw.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
}

/**
 * Recognise IP literals written in the canonical decimal form, as well as
 * the URL-parser-friendly forms attackers use to dodge naive checks:
 *   0x7f000001   → 127.0.0.1   (hex)
 *   0177.0.0.1   → 127.0.0.1   (per-octet octal)
 *   2130706433   → 127.0.0.1   (decimal integer)
 *   ::ffff:127.0.0.1            (IPv4-mapped IPv6)
 *   [::1]                       (IPv6 literal, brackets already stripped by URL)
 *
 * Returns the canonical IP string, or null if the host is not an IP at all.
 */
export function normalizeIpLiteral(host: string): string | null {
  // IPv4-mapped IPv6 like ::ffff:127.0.0.1 → 127.0.0.1. Done before the
  // canonical isIP() check because Node treats the mapped form as valid
  // IPv6 and we want the v4 SSRF rules to apply.
  const mappedDotted = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mappedDotted && isIP(mappedDotted[1]) === 4) return mappedDotted[1];

  // WHATWG URL canonicalizes ::ffff:10.0.0.1 to ::ffff:a00:1 (hex pairs).
  // Convert that back to the IPv4 form so the SSRF rules see "10.0.0.1".
  const mappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    if (Number.isFinite(hi) && Number.isFinite(lo) && hi >= 0 && hi <= 0xffff && lo >= 0 && lo <= 0xffff) {
      return uint32ToIpv4((hi << 16) | lo);
    }
  }

  // Canonical IPv4 / IPv6 form is the cheap path.
  if (isIP(host) !== 0) return host.toLowerCase();

  // Single 32-bit decimal integer.
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    if (Number.isInteger(n) && n >= 0 && n <= 0xffffffff) {
      return uint32ToIpv4(n);
    }
  }

  // Single 32-bit hex integer (0xNN).
  if (/^0x[0-9a-f]+$/i.test(host)) {
    const n = parseInt(host, 16);
    if (Number.isFinite(n) && n >= 0 && n <= 0xffffffff) {
      return uint32ToIpv4(n);
    }
  }

  // Dotted form where any octet is hex or octal: 0177.0.0.1, 0x7f.0.0.1, etc.
  const dotted = host.split('.');
  if (dotted.length === 4) {
    const octets: number[] = [];
    for (const part of dotted) {
      let n: number;
      if (/^0x[0-9a-f]+$/i.test(part)) n = parseInt(part, 16);
      else if (/^0[0-7]+$/.test(part)) n = parseInt(part, 8);
      else if (/^\d+$/.test(part)) n = parseInt(part, 10);
      else return null;
      if (!Number.isInteger(n) || n < 0 || n > 0xff) return null;
      octets.push(n);
    }
    return octets.join('.');
  }

  return null;
}

function uint32ToIpv4(n: number): string {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
}

function stripIpv6Brackets(host: string): string {
  if (host.startsWith('[') && host.endsWith(']')) return host.slice(1, -1);
  return host;
}

/**
 * Reject anything that would let a tenant talk to the backend's internal
 * network: RFC1918, loopback, link-local (incl. AWS 169.254.169.254 metadata),
 * IPv6 ULA, IPv6 loopback / link-local, multicast, broadcast, unspecified,
 * and carrier-grade NAT.
 */
export function isPrivateIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true; // unparseable counts as unsafe
}

function isPrivateIpv4(ip: string): boolean {
  const [a, b] = ip.split('.').map((p) => parseInt(p, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  if (a === 0) return true; // 0.0.0.0/8 unspecified / "this network"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (AWS metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // multicast (224/4) + reserved (240/4) + broadcast (255.255.255.255)
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true; // unspecified + loopback
  if (lower.startsWith('fe80:')) return true; // link-local fe80::/10
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
  if (lower.startsWith('ff')) return true; // multicast ff00::/8
  // IPv4-mapped form delegates to the v4 check (already handled in
  // normalizeIpLiteral; this catches anything sneaking through dns lookup).
  const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}
