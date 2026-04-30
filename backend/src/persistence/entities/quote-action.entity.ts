import { Column, Entity } from 'typeorm';
import { BaseActionEntity } from './action-base.entity';

@Entity('quote_actions')
export class QuoteActionEntity extends BaseActionEntity {
  @Column({ type: 'text' })
  text!: string;

  @Column({ name: 'target_tweet_url', type: 'text' })
  targetTweetUrl!: string;

  @Column({ name: 'result_tweet_id', type: 'text', nullable: true })
  resultTweetId!: string | null;

  @Column({ name: 'result_tweet_url', type: 'text', nullable: true })
  resultTweetUrl!: string | null;

  @Column({ name: 'result_sent_at', type: 'timestamptz', nullable: true })
  resultSentAt!: Date | null;
}
