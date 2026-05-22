import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { AccountStatus } from '@domain/types/account.types';
import { cookieCipherTransformer } from '@common/crypto/cookie-cipher.transformer';

@Entity('accounts')
export class AccountEntity {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'display_name', type: 'text', nullable: true })
  displayName!: string | null;

  @Column({ name: 'auth_token', type: 'text', transformer: cookieCipherTransformer })
  authToken!: string;

  @Column({ name: 'auth_multi', type: 'text', nullable: true, transformer: cookieCipherTransformer })
  authMulti!: string | null;

  @Column({ name: 'ct0', type: 'text', nullable: true, transformer: cookieCipherTransformer })
  ct0!: string | null;

  @Column({ name: 'twid', type: 'text', nullable: true, transformer: cookieCipherTransformer })
  twid!: string | null;

  @Index()
  @Column({ type: 'text', default: 'active' })
  status!: AccountStatus;

  @Column({ name: 'totp_secret_encrypted', type: 'text', nullable: true })
  totpSecretEncrypted!: string | null;

  @Column({ name: 'proxy_country', type: 'text', nullable: true })
  proxyCountry!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;
}
