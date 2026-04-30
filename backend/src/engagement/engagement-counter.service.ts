import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ActionType } from '../domain/types/action.types';

type CountableAction = 'like' | 'retweet' | 'quote' | 'bookmark';

const ACTION_COUNT_QUERIES: Record<CountableAction, string> = {
  like: `SELECT COUNT(*)::int AS cnt FROM like_actions WHERE account_id = $1 AND status = 'succeeded' AND result_at >= CURRENT_DATE`,
  retweet: `SELECT COUNT(*)::int AS cnt FROM retweet_actions WHERE account_id = $1 AND status = 'succeeded' AND result_at >= CURRENT_DATE`,
  quote: `SELECT COUNT(*)::int AS cnt FROM quote_actions WHERE account_id = $1 AND status = 'succeeded' AND result_sent_at >= CURRENT_DATE`,
  bookmark: `SELECT COUNT(*)::int AS cnt FROM bookmark_actions WHERE account_id = $1 AND status = 'succeeded' AND result_at >= CURRENT_DATE`,
};

@Injectable()
export class EngagementCounterService {
  private readonly log = new Logger(EngagementCounterService.name);

  constructor(private readonly dataSource: DataSource) {}

  async getDailyCount(accountId: string, actionType: CountableAction): Promise<number> {
    const sql = ACTION_COUNT_QUERIES[actionType];
    if (!sql) return 0;
    const rows: Array<{ cnt: number }> = await this.dataSource.query(sql, [accountId]);
    return rows[0]?.cnt ?? 0;
  }

  async getAllDailyCounts(accountId: string): Promise<Record<CountableAction, number>> {
    const [like, retweet, quote, bookmark] = await Promise.all([
      this.getDailyCount(accountId, 'like'),
      this.getDailyCount(accountId, 'retweet'),
      this.getDailyCount(accountId, 'quote'),
      this.getDailyCount(accountId, 'bookmark'),
    ]);
    return { like, retweet, quote, bookmark };
  }

  async withinDailyLimit(accountId: string, actionType: CountableAction, maxPerDay: number): Promise<boolean> {
    if (maxPerDay <= 0) return false;
    const count = await this.getDailyCount(accountId, actionType);
    return count < maxPerDay;
  }
}
