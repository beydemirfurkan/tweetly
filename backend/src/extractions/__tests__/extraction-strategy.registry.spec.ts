import { ExtractionStrategyRegistry } from '../strategies/extraction-strategy.registry';
import type { IExtractionStrategy } from '../strategies/extraction-strategy.port';
import { EXTRACTION_TYPES } from '@persistence/entities/extraction-job.entity';

function stub(type: IExtractionStrategy['type']): IExtractionStrategy {
  return { type, fetch: async () => ({ items: [], nextCursor: null }) };
}

describe('ExtractionStrategyRegistry', () => {
  it('builds a lookup map from injected strategies', () => {
    const strategies = EXTRACTION_TYPES.map(stub);
    const registry = new ExtractionStrategyRegistry(strategies);
    for (const t of EXTRACTION_TYPES) {
      expect(registry.forType(t).type).toBe(t);
    }
  });

  it('throws when a strategy is registered twice for the same type', () => {
    const dupes = [stub('user_followers'), stub('user_followers')];
    expect(() => new ExtractionStrategyRegistry(dupes)).toThrow(/Duplicate extraction strategy/);
  });

  it('throws when any extraction type is missing a strategy', () => {
    const partial = EXTRACTION_TYPES.slice(0, 3).map(stub);
    expect(() => new ExtractionStrategyRegistry(partial)).toThrow(/Missing extraction strategies/);
  });
});
