import { Column, Entity } from 'typeorm';
import { BaseActionEntity } from './action-base.entity';

@Entity('post_actions')
export class PostActionEntity extends BaseActionEntity {
  @Column({ type: 'text' })
  text!: string;

  @Column({ name: 'media_path', type: 'text', nullable: true })
  mediaPath!: string | null;

  @Column({ name: 'result_tweet_id', type: 'text', nullable: true })
  resultTweetId!: string | null;

  @Column({ name: 'result_tweet_url', type: 'text', nullable: true })
  resultTweetUrl!: string | null;

  @Column({ name: 'result_sent_at', type: 'timestamptz', nullable: true })
  resultSentAt!: Date | null;
}
