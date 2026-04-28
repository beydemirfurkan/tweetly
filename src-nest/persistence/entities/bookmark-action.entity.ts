import { Column, Entity } from 'typeorm';
import { BaseActionEntity } from './action-base.entity';

@Entity('bookmark_actions')
export class BookmarkActionEntity extends BaseActionEntity {
  @Column({ name: 'target_tweet_url', type: 'text' })
  targetTweetUrl!: string;

  @Column({ name: 'target_tweet_id', type: 'text', nullable: true })
  targetTweetId!: string | null;

  @Column({ name: 'result_at', type: 'timestamptz', nullable: true })
  resultAt!: Date | null;
}
