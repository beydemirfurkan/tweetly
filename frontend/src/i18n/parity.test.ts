import { describe, expect, it } from 'vitest';
import enMessages from '../../messages/en.json';
import trMessages from '../../messages/tr.json';

function collectMessagePaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectMessagePaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

function missingPaths(source: string[], target: string[]) {
  const targetPaths = new Set(target);
  return source.filter((path) => !targetPaths.has(path));
}

function missingMessage(locale: string, paths: string[]) {
  return paths.length > 0 ? `missing in ${locale}: ${paths.join(', ')}` : `missing in ${locale}: none`;
}

describe('i18n message parity', () => {
  it('keeps Turkish and English message keys in sync', () => {
    const enPaths = collectMessagePaths(enMessages).sort();
    const trPaths = collectMessagePaths(trMessages).sort();
    const missingInEn = missingPaths(trPaths, enPaths);
    const missingInTr = missingPaths(enPaths, trPaths);

    expect(missingInEn, missingMessage('en', missingInEn)).toEqual([]);
    expect(missingInTr, missingMessage('tr', missingInTr)).toEqual([]);
  });
});
