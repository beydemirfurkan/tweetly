import crypto from 'crypto';
import { Injectable } from '@nestjs/common';

/**
 * Two pure fingerprint operations used by ContentMemoryService:
 *   - `hash`: short SHA-256 prefix for exact-match deduping.
 *   - `jaccard`: classic |A∩B| / |A∪B| over token sets.
 *
 * Kept separate from TextNormalizer so the math can be unit-tested without
 * dragging in tokenisation choices.
 */
@Injectable()
export class SimilarityScorer {
  /** Stable 64-bit prefix of SHA-256 — short enough to store, long enough to dedupe. */
  hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
  }

  /** Jaccard similarity over token sets. Returns 0 for empty inputs. */
  jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) {
      if (b.has(token)) intersection++;
    }
    return intersection / (a.size + b.size - intersection);
  }
}
