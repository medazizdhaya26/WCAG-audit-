import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PageAudit } from './page-audit.entity';
import { IssueImpact } from './enums';

@Entity({ name: 'accessibility_issues' })
@Index(['pageAuditId'])
@Index(['ruleId', 'impact'])
export class AccessibilityIssue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  pageAuditId!: string;

  @ManyToOne(() => PageAudit, (p) => p.issues, { onDelete: 'CASCADE' })
  pageAudit!: PageAudit;

  @Column({ type: 'text', default: 'axe' })
  tool!: string;

  @Column({ type: 'text' })
  ruleId!: string;

  @Column({ type: 'enum', enum: IssueImpact, default: IssueImpact.UNKNOWN })
  impact!: IssueImpact;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text' })
  help!: string;

  @Column({ type: 'text', nullable: true })
  helpUrl!: string | null;

  @Column({ type: 'int', default: 0 })
  nodes!: number;

  @Column({ type: 'jsonb' })
  details!: any;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

