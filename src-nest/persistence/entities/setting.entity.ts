import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type SettingValueType = 'string' | 'number' | 'boolean' | 'json';

@Entity('settings')
export class SettingEntity {
  @PrimaryColumn({ type: 'text' })
  key!: string;

  @Index()
  @PrimaryColumn({ name: 'account_id', type: 'text', default: '' })
  accountId!: string;

  @Column({ type: 'text' })
  value!: string;

  @Column({ type: 'text', default: 'string' })
  type!: SettingValueType;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
