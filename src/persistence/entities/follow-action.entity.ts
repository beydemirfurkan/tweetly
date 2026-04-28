import { Column, Entity } from 'typeorm';
import { BaseActionEntity } from './action-base.entity';

@Entity('follow_actions')
export class FollowActionEntity extends BaseActionEntity {
  @Column({ name: 'target_handle', type: 'text' })
  targetHandle!: string;

  @Column({ name: 'result_at', type: 'timestamptz', nullable: true })
  resultAt!: Date | null;
}
