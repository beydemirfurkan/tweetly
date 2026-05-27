import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { AccountEntity } from './account.entity';

@Entity('account_style_profiles')
export class AccountStyleProfileEntity {
  @PrimaryColumn({ name: 'account_id', type: 'text' })
  accountId!: string;

  @OneToOne(() => AccountEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account!: AccountEntity;

  @Column({ name: 'style_profile', type: 'jsonb', nullable: true })
  styleProfile!: Record<string, unknown> | null;

  @Column({ name: 'custom_instructions', type: 'text', default: '' })
  customInstructions!: string;

  @Column({ name: 'tweet_language', type: 'text', default: 'tr' })
  tweetLanguage!: string;

  @Column({ name: 'analyzed_at', type: 'timestamptz', nullable: true })
  analyzedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
