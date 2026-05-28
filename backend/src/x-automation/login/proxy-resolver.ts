import { Logger } from '@nestjs/common';
import { envBackedConfig } from '@/config/process-env-shim';

const log = new Logger('LoginProxyResolver');

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

/**
 * Map a 2-letter country code to a proxy URL using env vars of the form
 *   LOGIN_PROXY_<CC>=http[s]://[user:pass@]host:port
 * If unset, returns null and the login goes out via the host IP — fine for dev,
 * but X is more likely to flag concentrated logins from a single egress.
 *
 * Example:
 *   LOGIN_PROXY_TR=http://user:pass@tr.proxy.example:8080
 *   LOGIN_PROXY_US=http://user:pass@us.proxy.example:8080
 */
export function resolveProxy(country: string | null | undefined): ProxyConfig | null {
  if (!country) return null;
  const cc = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;

  const raw = envBackedConfig().raw(`LOGIN_PROXY_${cc}`);
  if (!raw) {
    log.warn(`No proxy configured for country=${cc} (set LOGIN_PROXY_${cc}); falling back to host IP`);
    return null;
  }

  try {
    const url = new URL(raw);
    return {
      server: `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
    };
  } catch {
    log.warn(`Invalid LOGIN_PROXY_${cc} value, ignoring`);
    return null;
  }
}

export function hasLoginProxy(country: string | null | undefined): boolean {
  if (!country) return false;
  const cc = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return false;
  return Boolean(envBackedConfig().getOptionalString(`LOGIN_PROXY_${cc}`));
}
