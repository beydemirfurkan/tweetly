import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('api_keys')
export class ApiKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Index({ unique: true })
  @Column({ name: 'key_hash', type: 'text' })
  keyHash!: string;

  @Column({ name: 'key_prefix', type: 'text' })
  keyPrefix!: string;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  scopes!: string[];

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  // 'manual' = created via panel /api-keys flow (default).
  // 'oauth' = issued by the OAuth authorization_code grant; oauthClientId
  // points at the OAuthClient that requested it.
  @Column({ name: 'issued_via', type: 'text', default: () => `'manual'` })
  issuedVia!: 'manual' | 'oauth';

  @Index()
  @Column({ name: 'oauth_client_id', type: 'text', nullable: true })
  oauthClientId!: string | null;
}
