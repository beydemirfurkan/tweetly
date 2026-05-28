import { Inject, Injectable } from '@nestjs/common';
import {
  EXTRACTION_TYPES,
  type ExtractionType,
} from '@persistence/entities/extraction-job.entity';
import { EXTRACTION_STRATEGY, type IExtractionStrategy } from './extraction-strategy.port';

@Injectable()
export class ExtractionStrategyRegistry {
  private readonly map = new Map<ExtractionType, IExtractionStrategy>();

  constructor(@Inject(EXTRACTION_STRATEGY) strategies: IExtractionStrategy[]) {
    for (const s of strategies) {
      if (this.map.has(s.type)) {
        throw new Error(`Duplicate extraction strategy registered for type=${s.type}`);
      }
      this.map.set(s.type, s);
    }
    const missing = EXTRACTION_TYPES.filter((t) => !this.map.has(t));
    if (missing.length > 0) {
      throw new Error(`Missing extraction strategies for: ${missing.join(', ')}`);
    }
  }

  forType(type: ExtractionType): IExtractionStrategy {
    const s = this.map.get(type);
    if (!s) throw new Error(`No strategy registered for extraction type: ${type}`);
    return s;
  }
}
