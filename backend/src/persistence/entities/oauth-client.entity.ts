import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('oauth_clients')
export class OAuthClientEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'client_id', type: 'text' })
  clientId!: string;

  @Column({ name: 'client_secret_hash', type: 'text' })
  clientSecretHash!: string;

  @Column({ name: 'client_name', type: 'text' })
  clientName!: string;

  @Column({ name: 'redirect_uris', type: 'jsonb' })
  redirectUris!: string[];

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
