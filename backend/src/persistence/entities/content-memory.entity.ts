import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('content_memory')
@Index('idx_content_memory_text_hash', ['textHash'])
@Index('idx_content_memory_created_at', ['createdAt'])
export class ContentMemoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'text' })
  repo!: string;

  @Column({ name: 'text_hash', type: 'text' })
  textHash!: string;

  @Column({ type: 'text' })
  signature!: string;

  @Column({ type: 'text' })
  text!: string;

  @Index()
  @Column({ name: 'account_id', type: 'text', nullable: true })
  accountId!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
