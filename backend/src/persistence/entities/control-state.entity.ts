import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('control_state')
export class ControlStateEntity {
  @PrimaryColumn({ type: 'text' })
  key!: string;

  @PrimaryColumn({ name: 'account_id', type: 'text', default: '' })
  accountId!: string;

  @Column({ type: 'text' })
  value!: string;
}
