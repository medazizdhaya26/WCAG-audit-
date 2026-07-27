import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WebsiteAudit } from './website-audit.entity';

@Entity({ name: 'audit_history' })
export class AuditHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  websiteAuditId!: string;

  @ManyToOne(() => WebsiteAudit, (w) => w.history, { onDelete: 'CASCADE' })
  websiteAudit!: WebsiteAudit;

  @CreateDateColumn({ type: 'timestamptz' })
  triggeredAt!: Date;

  @Column({ type: 'jsonb' })
  params!: any;
}

