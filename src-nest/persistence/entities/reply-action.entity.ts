import { Column, Entity } from 'typeorm';
import { BaseActionEntity } from './action-base.entity';

@Entity('reply_actions')
export class ReplyActionEntity extends BaseActionEntity {
  @Column({ type: 'text' })
  text!: string;

  @Column({ name: 'parent_tweet_url', type: 'text' })
  parentTweetUrl!: string;

  @Column({ name: 'result_tweet_id', type: 'text', nullable: true })
  resultTweetId!: string | null;

  @Column({ name: 'result_tweet_url', type: 'text', nullable: true })
  resultTweetUrl!: string | null;

  @Column({ name: 'result_sent_at', type: 'timestamptz', nullable: true })
  resultSentAt!: Date | null;
}
