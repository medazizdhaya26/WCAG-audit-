import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { WebsiteAudit } from './website-audit.entity';
import { PageAuditStatus } from './enums';
import { AccessibilityIssue } from './accessibility-issue.entity';
import { Screenshot } from './screenshot.entity';

export type CategoryScores = {
  perceivable: number;
  operable: number;
  understandable: number;
  robust: number;
};

export type WCAGCompliance = {
  wcag20A: number;
  wcag20AA: number;
  wcag20AAA: number;
  wcag21A: number;
  wcag21AA: number;
  wcag21AAA: number;
};

export type IssueBreakdown = {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
};

@Entity({ name: 'page_audits' })
@Index(['websiteAuditId', 'status'])
@Unique('uq_page_audit_website_normalized', ['websiteAuditId', 'normalizedUrl'])
export class PageAudit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  websiteAuditId!: string;

  @ManyToOne(() => WebsiteAudit, (w) => w.pages, { onDelete: 'CASCADE' })
  websiteAudit!: WebsiteAudit;

  @Column({ type: 'text' })
  url!: string;

  @Column({ type: 'text' })
  normalizedUrl!: string;

  @Column({ type: 'text', nullable: true })
  finalUrl!: string | null;

  @Column({ type: 'int', default: 0 })
  depth!: number;

  @Column({ type: 'enum', enum: PageAuditStatus, default: PageAuditStatus.QUEUED })
  status!: PageAuditStatus;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @Column({ type: 'int', nullable: true })
  httpStatus!: number | null;

  @Column({ type: 'text', nullable: true })
  title!: string | null;

  @Column({ type: 'float', nullable: true })
  lighthouseScore!: number | null;

  @Column({ type: 'float', nullable: true })
  pageScore!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  categoryScores!: CategoryScores | null;

  @Column({ type: 'jsonb', nullable: true })
  wcagCompliance!: WCAGCompliance | null;

  @Column({ type: 'jsonb', nullable: true })
  issueBreakdown!: IssueBreakdown | null;

  @Column({ type: 'jsonb', nullable: true })
  waveAnalysis!: any | null;

  @Column({ type: 'jsonb', nullable: true })
  axeRaw!: any | null;

  // Code HTML complet de la page rendue (pour relecture / ré-analyse)
  @Column({ type: 'text', nullable: true })
  html!: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @OneToMany(() => AccessibilityIssue, (i) => i.pageAudit)
  issues!: AccessibilityIssue[];

  @OneToOne(() => Screenshot, (s) => s.pageAudit)
  screenshot!: Screenshot | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

