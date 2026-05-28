import type { AppConfigService } from './app-config.service';

/**
 * Reusable AppConfigService-shaped wrapper around process.env. Used by the
 * handful of services that accept `AppConfigService` as an Optional
 * constructor arg so smoke-scripts and hand-rolled `new Service()` calls
 * keep working without going through the DI container.
 *
 * Keeping this in `config/` (allowlisted for direct process.env access) so
 * the shim path is one file instead of a duplicated block in every
 * Optional-injection service.
 */
export type EnvBackedConfig = Pick<
  AppConfigService,
  'getNumber' | 'getString' | 'getBoolean' | 'getOptionalString' | 'raw'
>;

export function envBackedConfig(): EnvBackedConfig {
  const env = process.env;
  return {
    getNumber(key, fb) {
      const raw = env[key];
      if (raw === undefined) return fb;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : fb;
    },
    getString(key, fb) {
      const raw = env[key];
      return typeof raw === 'string' && raw.trim() !== '' ? raw : fb;
    },
    getOptionalString(key) {
      const raw = env[key];
      return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
    },
    getBoolean(key, fb) {
      const raw = env[key];
      if (raw === undefined) return fb;
      return raw.trim().toLowerCase() === 'true';
    },
    raw(key) {
      return env[key];
    },
  };
}
