import { Injectable } from '@nestjs/common';

/**
 * Stateless text-shaping primitives. Lower-cases, strips URLs, removes
 * citation markers we use in templates (`repo:`, `github:`, `kaynak:`)
 * and collapses whitespace so similarity scoring works on apples-to-apples
 * tokens.
 *
 * Has no dependency on the database; it can be reused anywhere we need a
 * canonical text shape (e.g. agent suggestion deduping, search indexing).
 */
@Injectable()
export class TextNormalizer {
  /** Min token length kept by `tokenize` — filters out stopwords + noise. */
  static readonly TOKEN_MIN_LENGTH = 4;
  /** How many opening tokens form the `signature` fingerprint. */
  static readonly SIGNATURE_TOKEN_COUNT = 14;

  normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, '')
      .replace(/repo:|github:|kaynak:/g, '')
      .replace(/[^a-z0-9ğüşöçıİ\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** First N tokens of normalized text — used to spot near-duplicate openings. */
  signature(text: string): string {
    return this.normalize(text).split(' ').slice(0, TextNormalizer.SIGNATURE_TOKEN_COUNT).join(' ');
  }

  /** Tokenized set with short-token filter — input to Jaccard similarity. */
  tokenize(text: string): Set<string> {
    return new Set(
      this.normalize(text).split(' ').filter((w) => w.length >= TextNormalizer.TOKEN_MIN_LENGTH),
    );
  }
}
