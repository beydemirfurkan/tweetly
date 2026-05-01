import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { AccountEntity } from './account.entity';

@Entity('account_profiles')
export class AccountProfileEntity {
  @PrimaryColumn({ name: 'account_id', type: 'text' })
  accountId!: string;

  @OneToOne(() => AccountEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account!: AccountEntity;

  @Column({ name: 'display_name', type: 'text', default: '' })
  displayName!: string;

  @Column({ name: 'bio', type: 'text', default: '' })
  bio!: string;

  @Column({ name: 'followers_count', type: 'text', default: '' })
  followersCount!: string;

  @Column({ name: 'following_count', type: 'text', default: '' })
  followingCount!: string;

  @Column({ name: 'tweets_count', type: 'text', default: '' })
  tweetsCount!: string;

  @Column({ name: 'profile_image_url', type: 'text', default: '' })
  profileImageUrl!: string;

  @Column({ name: 'verified', type: 'boolean', default: false })
  verified!: boolean;

  @Column({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt!: Date;
}
