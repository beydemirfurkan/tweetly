import { Column, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { ActionStatus, ErrorClass } from '../../domain/types/action.types';

export abstract class BaseActionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'text', default: 'pending' })
  status!: ActionStatus;

  @Index()
  @Column({ name: 'account_id', type: 'text' })
  accountId!: string;

  @Column({ name: 'idempotency_key', type: 'text', unique: true })
  idempotencyKey!: string;

  @Index()
  @Column({ name: 'parent_action_ref', type: 'text', nullable: true })
  parentActionRef!: string | null;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ name: 'max_attempts', type: 'integer', default: 3 })
  maxAttempts!: number;

  @Index()
  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @Column({ name: 'locked_by', type: 'text', nullable: true })
  lockedBy!: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'error_class', type: 'text', nullable: true })
  errorClass!: ErrorClass | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  metadata!: Record<string, unknown>;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
