import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type LoginJobKind = 'connect' | 'reauth';
export type LoginJobStatus = 'queued' | 'running' | 'success' | 'failed';
export type LoginJobFailureReason =
  | 'invalid_credentials'
  | 'captcha_required'
  | 'email_challenge'
  | 'email_verification_required'
  | 'suspicious_login_blocked'
  | 'login_cooldown'
  | 'cookies_missing'
  | 'home_not_reached'
  | 'account_locked'
  | 'phone_verification_required'
  | 'unknown';

@Entity('account_login_jobs')
export class AccountLoginJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'text' })
  kind!: LoginJobKind;

  @Index()
  @Column({ name: 'target_account_id', type: 'text', nullable: true })
  targetAccountId!: string | null;

  @Index()
  @Column({ type: 'text', default: 'queued' })
  status!: LoginJobStatus;

  @Column({ type: 'text' })
  username!: string;

  @Column({ type: 'text', nullable: true })
  email!: string | null;

  @Column({ name: 'encrypted_password', type: 'text', nullable: true })
  encryptedPassword!: string | null;

  @Column({ name: 'encrypted_totp_secret', type: 'text', nullable: true })
  encryptedTotpSecret!: string | null;

  @Column({ name: 'save_totp_secret', type: 'boolean', default: false })
  saveTotpSecret!: boolean;

  @Column({ name: 'proxy_country', type: 'text', nullable: true })
  proxyCountry!: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: LoginJobFailureReason | null;

  @Column({ name: 'failure_detail', type: 'text', nullable: true })
  failureDetail!: string | null;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;
}
