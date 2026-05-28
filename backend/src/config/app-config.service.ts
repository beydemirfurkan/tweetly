import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Typed facade over `@nestjs/config`'s ConfigService. Everything in `src/`
 * that needs to read an env variable should depend on this class instead
 * of touching `process.env` directly — that's the DIP seam we need so
 * tests can swap configuration without setting/unsetting globals.
 *
 * The ESLint rule in `eslint.config.mjs` enforces this: direct
 * `process.env.X` reads are blocked outside `config/`, `main.ts`,
 * `__tests__/`, `scripts/` and `persistence/migrations/`.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  /** Raw value if present, else fallback. Empty strings count as missing. */
  getString(key: string, fallback: string): string {
    const raw = this.config.get<string>(key);
    return typeof raw === 'string' && raw.trim() !== '' ? raw : fallback;
  }

  /** Trimmed value when present + non-empty; otherwise null. */
  getOptionalString(key: string): string | null {
    const raw = this.config.get<string>(key);
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    return trimmed.length > 0 ? trimmed : null;
  }

  /** Parsed integer; non-numeric values fall back. */
  getNumber(key: string, fallback: number): number {
    const raw = this.config.get<string>(key);
    if (raw === undefined) return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  /** "true" (case-insensitive) → true; anything else falls back. */
  getBoolean(key: string, fallback: boolean): boolean {
    const raw = this.config.get<string>(key);
    if (raw === undefined) return fallback;
    return raw.trim().toLowerCase() === 'true';
  }

  /**
   * Escape hatch for one-off raw access (URL parsing, JSON decoding, etc.).
   * Prefer the typed getters above when possible.
   */
  raw(key: string): string | undefined {
    return this.config.get<string>(key);
  }
}
