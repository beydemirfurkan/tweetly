import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface FormatStats {
  format: string;
  total: number;
  success: number;
  failure: number;
  successRate: number;
  avgDurationMs: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly dataSource: DataSource) {}

  async getFormatPerformance(since: Date, accountId?: string | null): Promise<FormatStats[]> {
    const sinceIso = since.toISOString();
    const rows: Array<{ format: string; type: string; cnt: string; avg_dur: string | null }> =
      accountId
        ? await this.dataSource.query(
            `SELECT format, type, COUNT(*)::text AS cnt, AVG(duration_ms)::text AS avg_dur
               FROM analytics_events
              WHERE timestamp >= $1 AND format IS NOT NULL
                AND (account_id = $2 OR account_id IS NULL)
              GROUP BY format, type`,
            [sinceIso, accountId],
          )
        : await this.dataSource.query(
            `SELECT format, type, COUNT(*)::text AS cnt, AVG(duration_ms)::text AS avg_dur
               FROM analytics_events
              WHERE timestamp >= $1 AND format IS NOT NULL
              GROUP BY format, type`,
            [sinceIso],
          );

    const map = new Map<
      string,
      { total: number; success: number; failure: number; totalDur: number; durCount: number }
    >();

    for (const row of rows) {
      const entry = map.get(row.format) ?? { total: 0, success: 0, failure: 0, totalDur: 0, durCount: 0 };
      const cnt = parseInt(row.cnt, 10);
      entry.total += cnt;
      if (row.type.endsWith('_success') || row.type === 'post_success' || row.type === 'reply_success') {
        entry.success += cnt;
      }
      if (row.type.endsWith('_failure') || row.type === 'post_failure' || row.type === 'reply_failure') {
        entry.failure += cnt;
      }
      if (row.avg_dur != null) {
        entry.totalDur += parseFloat(row.avg_dur) * cnt;
        entry.durCount += cnt;
      }
      map.set(row.format, entry);
    }

    return Array.from(map.entries()).map(([format, s]) => ({
      format,
      total: s.total,
      success: s.success,
      failure: s.failure,
      successRate: s.total > 0 ? s.success / s.total : 0,
      avgDurationMs: s.durCount > 0 ? s.totalDur / s.durCount : 0,
    }));
  }
}
