// Public-facing URLs for OAuth metadata. Prefers PUBLIC_BACKEND_URL when
// set; otherwise derives from the inbound request's forwarded headers
// (Coolify / nginx / Cloudflare set X-Forwarded-Host + X-Forwarded-Proto)
// so deploys without explicit env config still produce the right URLs.
import type { Request } from 'express';
import { envBackedConfig } from '@/config/process-env-shim';

export function backendBaseUrl(req?: Request): string {
  const env = envBackedConfig().getOptionalString('PUBLIC_BACKEND_URL');
  if (env) return env.replace(/\/$/, '');

  if (req) {
    const fromHeaders = deriveFromRequest(req);
    if (fromHeaders) return fromHeaders;
  }

  return 'http://localhost:3001';
}

export function appBaseUrl(): string {
  return envBackedConfig().getString('APP_URL', 'http://localhost:3000').replace(/\/$/, '');
}

function deriveFromRequest(req: Request): string | null {
  const xfh = firstHeaderValue(req.headers['x-forwarded-host']);
  const xfp = firstHeaderValue(req.headers['x-forwarded-proto']);
  const host = xfh ?? req.get('host');
  if (!host) return null;
  const proto = xfp ?? req.protocol ?? 'https';
  return `${proto}://${host}`;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(',')[0]?.trim() || undefined;
}

export const MCP_RESOURCE_PATH = '/mcp';
